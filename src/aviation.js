import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {atomicJson,exists,readJson} from './history-files.js';
import {historyRows} from './radar-history.js';
import {decodeAviation} from './aviation-decoder.js';
import {withObservedClouds} from './aviation-clouds.js';
import {aviationProducts} from '../public/aviation-model.js';
export const AVIATION_POLL_MS=300000;
const source=product=>'aviation-'+product;
async function boundedText(response){
 const reader=response.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let bytes=0,text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>128000)throw Error('Oversized response');text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{await reader.cancel().catch(()=>{});}
}
export function normalizeReport(value,product,station,acquiredAt,revision){
 const raw=value?.[product==='metar'?'rawOb':'rawTAF'];
 if(value?.icaoId!==station||typeof raw!=='string'||!raw.trim()||raw.length>12000)throw Error('Invalid aviation report');
 const issuedAt=product==='taf'?Date.parse(value.issueTime):null,observedAt=product==='metar'?Number(value.obsTime)*1000:null;
 const reportTime=issuedAt??observedAt;
 if(!Number.isFinite(reportTime)||reportTime<=0||reportTime>acquiredAt)throw Error('Invalid report timestamp');
 const validFrom=product==='taf'?Number(value.validTimeFrom)*1000:null,validTo=product==='taf'?Number(value.validTimeTo)*1000:null;
 if(product==='taf'&&(!Number.isFinite(validFrom)||!Number.isFinite(validTo)||validTo<=validFrom)&&!/(?:^|\s)(?:CNL|NIL)(?:\s|$)/.test(raw))throw Error('Invalid TAF period');
 return withObservedClouds({product,station,name:typeof value.name==='string'?value.name.slice(0,100):station,raw,issuedAt,observedAt,validFrom:Number.isFinite(validFrom)?validFrom:null,validTo:Number.isFinite(validTo)?validTo:null,acquiredAt,revision,cancelled:/(?:^|\s)(?:CNL|NIL)(?:\s|$)/.test(raw),...decodeAviation(raw,{product,issuedAt,observedAt,station})});
}
export async function loadAviationHistory(store,end,hours){
 const start=Math.max(0,(end-hours*3600)*1000),stop=end*1000,cutoff=(await store.status()).cutoff??0;
 const base=await store.contextBefore({source:'aviation-status',context:'appliance',end:start});
 const events=await historyRows(store,{kind:'transition',source:'aviation-status',context:'appliance',start,end:stop});
 const states=[...(base&&base.time>=cutoff?[{time:base.time,...base.data}]:[]),...events.map(r=>({time:r.time,...r.data}))];
 const stations=[...new Set(states.map(s=>s.station))].filter(Boolean),reports=[];
 for(const station of stations)for(const product of aviationProducts){
  const before=await store.contextBefore({source:source(product),context:station,end:start});
  if(before&&before.time>=cutoff)reports.push(before.data);
  const rows=await historyRows(store,{kind:'transition',source:source(product),context:station,start,end:stop});reports.push(...rows.map(r=>r.data));
 }
 return {states,reports:reports.map(withObservedClouds).sort((a,b)=>a.acquiredAt-b.acquiredAt),cutoff};
}
export async function createAviation(directory,{store,freshInstallation=false,autoStart=true,fetcher=fetch,now=Date.now}={}){
 const path=join(directory,'settings','aviation.json');await mkdir(join(directory,'settings'),{recursive:true});
 let config=await exists(path)?await readJson(path):{version:1,enabled:!!freshInstallation,station:'EGBB',revision:1};
 if(config.version!==1||typeof config.enabled!=='boolean'||!/^([A-Z0-9]{4})$/.test(config.station)||!Number.isSafeInteger(config.revision))throw Error('Invalid saved aviation settings');
 await atomicJson(path,config);
 let live=await store.weatherState('aviation-live'),timer,busy=false,closed=false,controller=null,writing=Promise.resolve(),configurationBusy=false;
 if(!live||live.revision!==config.revision||live.station!==config.station)live={...config,reports:{},products:Object.fromEntries(aviationProducts.map(p=>[p,{state:'pending'}]))};
 live.enabled=config.enabled;
 // Upgrade cached observations without changing their acquisition time/identity.
 live.reports=Object.fromEntries(Object.entries(live.reports??{}).map(([p,r])=>[p,withObservedClouds(r)]));
 const write=fn=>{const p=writing.then(fn);writing=p.catch(()=>{});return p;};
 async function publish(time=now()){const {reports,...state}=structuredClone(live);await write(async()=>{await store.put([{kind:'transition',source:'aviation-status',context:'appliance',time,receivedAt:time,data:state}]);await store.saveWeatherState('aviation-live',{...state,reports});});}
 async function collect(){
  if(busy||closed||!config.enabled)return;busy=true;const epoch=config.revision;
  try{for(const product of aviationProducts){
   if(closed||epoch!==config.revision||!config.enabled)break;
   controller=new AbortController();const attempt=now();let next,report;
   try{
    const response=await fetcher(`https://aviationweather.gov/api/data/${product}?ids=${config.station}&format=json${product==='taf'?'&time=issue':''}`,{headers:{'User-Agent':'PiRainRadar/aviation','Accept':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
    if(response.status===429||response.status>=500)throw Error('Collection interrupted');
    if(!response.ok&&response.status!==204)throw Error('Collection interrupted');
    let values=[];
    if(response.status!==204){const text=await boundedText(response);values=JSON.parse(text);if(!Array.isArray(values)||values.length>100)throw Error('Invalid response');}
    const acquiredAt=now();
    values=values.filter(v=>v?.icaoId===config.station).sort((a,b)=>(product==='taf'?Date.parse(b.issueTime)-Date.parse(a.issueTime):b.obsTime-a.obsTime));
    if(values.length)report=normalizeReport(values[0],product,config.station,acquiredAt,epoch);
    if(report?.clouds?.state==='error')throw Error('Invalid observed cloud groups');
    const previous=live.reports[product];
    if(report&&previous&&report.raw!==previous.raw&&(report.issuedAt??report.observedAt)<(previous.issuedAt??previous.observedAt))throw Error('Older report returned');
    if(report&&previous&&report.raw===previous.raw&&(report.issuedAt??report.observedAt)===(previous.issuedAt??previous.observedAt)&&report.validFrom===previous.validFrom&&report.validTo===previous.validTo)report=previous;
    next={state:!report||report.cancelled?'missing':'ready',lastAttempt:attempt,lastSuccess:acquiredAt,reportAcquiredAt:report?.acquiredAt??live.reports[product]?.acquiredAt??null,failures:0};
   }catch{report=undefined;next={...live.products[product],state:'error',lastAttempt:attempt,failures:(live.products[product]?.failures??0)+1};}
   if(closed||epoch!==config.revision||!config.enabled)break;
   if(report&&report!==live.reports[product])await write(()=>store.put([{kind:'transition',source:source(product),context:report.station,time:report.acquiredAt,receivedAt:report.acquiredAt,data:report}]));
   if(closed||epoch!==config.revision||!config.enabled)break;
   live={...live,products:{...live.products,[product]:next},reports:{...live.reports,...(report?{[product]:report}:{})}};await publish(next.state==='error'?now():next.lastSuccess);
  }}finally{busy=false;controller=null;if(autoStart&&!closed&&config.enabled){const failures=Math.max(...aviationProducts.map(p=>live.products[p]?.failures??0));timer=setTimeout(()=>void collect().catch(()=>{}),Math.min(3600000,AVIATION_POLL_MS*2**Math.min(failures,3)));timer.unref?.();}}
 }
 await publish();if(autoStart&&config.enabled)queueMicrotask(()=>void collect().catch(()=>{}));
 return {status:()=>structuredClone(live),collect,
  async configure(input){
   if(configurationBusy)return {status:409,error:'Aviation settings are being saved.'};
   if(!input||typeof input!=='object'||(input.enabled!==undefined&&typeof input.enabled!=='boolean')||(input.station!==undefined&&(typeof input.station!=='string'||!/^[A-Z0-9]{4}$/.test(input.station.trim().toUpperCase()))))return {status:400,error:'Enter a four-character ICAO station code.'};
   configurationBusy=true;
   try{const next={...config,enabled:input.enabled??config.enabled,station:input.station?.trim().toUpperCase()??config.station};
    if(next.enabled===config.enabled&&next.station===config.station)return {status:200,...this.status()};
    next.revision++;await atomicJson(path,next);clearTimeout(timer);controller?.abort();
    const changed=next.station!==config.station;config=next;live={...live,...config,...(changed?{reports:{},products:Object.fromEntries(aviationProducts.map(p=>[p,{state:'pending'}]))}:{})};
    // Re-enable keeps the same report's original acquisition, in a new policy epoch.
    live.reports=Object.fromEntries(Object.entries(live.reports).map(([p,r])=>[p,{...r,revision:config.revision}]));
    await publish();
    if(autoStart&&config.enabled){timer=setTimeout(()=>void collect().catch(()=>{}),busy?1000:0);timer.unref?.();}
    return {status:200,...this.status()};
   }finally{configurationBusy=false;}
  },async history(end,hours){return loadAviationHistory(store,end,hours);},
  async close(){closed=true;clearTimeout(timer);controller?.abort();while(busy)await new Promise(r=>setTimeout(r,10));await writing;}
 };
}
