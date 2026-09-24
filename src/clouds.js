import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import sharp from 'sharp';
import {atomicJson,exists,readJson} from './history-files.js';
import {makeViews,hash,radarTiles} from './map.js';
import {historyRows} from './radar-history.js';

export const cloudRoles=map=>map==='both'?['main','overview']:[map];
export async function createClouds(directory,{store,provider,settings,now=Date.now,autoStart=true,rainBusy=()=>false,onEvent=()=>{},onPolicy=async()=>{}}){
 const file=join(directory,'settings','clouds.json');await mkdir(join(directory,'settings'),{recursive:true});
 let config=await exists(file)?await readJson(file):{enabled:false,map:'main'};
 if(typeof config.enabled!=='boolean'||!['main','overview','both'].includes(config.map))throw Error('Invalid cloud settings');
 if(!provider.configured())config={...config,enabled:false};await atomicJson(file,config);
 await onPolicy({clouds:config.enabled,cloudMap:config.map});
 let changing=false,busy=false,revision=0,nextAt=now(),lastSuccess=null,error=null,closed=false,operation=null;
 const context=()=>hash(makeViews(settings()));
 async function rows(end,hours){return historyRows(store,{kind:'cloud',source:'rainbow',context:context(),start:Math.max(0,(end-hours*3600-1800)*1000),end:end*1000});}
 async function status(){
  const recent=await rows(Math.floor(now()/1000),1),roles=cloudRoles(config.map);
  const latest=Object.fromEntries(roles.map(role=>[role,recent.findLast(r=>r.role===role)?.time??null]));
  const times=Object.values(latest),oldest=times.every(Number.isFinite)?Math.min(...times):null;
  const state=!config.enabled?'disabled':!provider.configured()?'disabled':error?.code==='limit'||error?.code==='test-limit'?'budget':error?'error':oldest===null?'waiting':now()-oldest>1800000?'stale':now()-oldest>1200000?'delayed':'ready';
  return {...config,configured:provider.configured(),state,collecting:busy,nextAt:config.enabled?nextAt:null,lastSuccess,latest,error:error?.message??null,usage:provider.status().usage};
 }
 async function configure(input){
  if(!input||typeof input!=='object'||input.enabled!==undefined&&typeof input.enabled!=='boolean'||input.map!==undefined&&!['main','overview','both'].includes(input.map))return {status:400,error:'Choose Main, Overview or Both.'};
  if(changing)return {status:409,error:'Cloud settings are being saved.'};
  const next={...config,...(input.enabled!==undefined?{enabled:input.enabled}:{}),...(input.map!==undefined?{map:input.map}:{})};
  if(next.enabled&&!provider.configured())return {status:400,error:'Configure Rainbow in System > API first.'};
  changing=true;try{await atomicJson(file,next);await onPolicy({clouds:next.enabled,cloudMap:next.map});config=next;revision++;error=null;nextAt=now();return {status:200,...config};}finally{changing=false;}
 }
 async function collect(){
  if(closed||busy||!config.enabled||!provider.configured()||now()<nextAt||rainBusy())return;
  busy=true;nextAt=now()+600000;const epoch=revision,views=makeViews(settings()),ctx=hash(views),roles=cloudRoles(config.map);
  const valid=()=>!closed&&config.enabled&&epoch===revision&&ctx===context();
  operation=(async()=>{try{
   const end=await provider.cloudSnapshot();if(!valid())return;
   const existing=await rows(end,3),present=new Set(existing.map(r=>`${r.role}:${r.time/1000}`));
   // Oldest first: recover the provider's bounded window once, never re-download retained images.
   const jobs=[];for(let time=end-7200;time<=end;time+=600)for(const role of roles)jobs.push({time,role});
   frames:for(const {time,role} of jobs){
    if(!valid())return;if(present.has(`${role}:${time}`))continue;
    const view=role==='main'?views.view:views.overviewView,tiles=radarTiles(view),overlays=[];
    for(const tile of tiles){
     if(!valid())return;if(rainBusy()){nextAt=now()+30000;return;}
     let bytes;try{bytes=await provider.cloudTile(time,tile);}catch(e){if(e.code==='not-found')continue frames;throw e;}if(!valid())return;
     const left=Math.max(0,tile.left),top=Math.max(0,tile.top),width=Math.min(view.width,tile.left+tile.size)-left,height=Math.min(view.height,tile.top+tile.tileHeight)-top;
     const input=await sharp(bytes).resize(tile.size,tile.tileHeight).extract({left:left-tile.left,top:top-tile.top,width,height}).png().toBuffer();overlays.push({input,left,top});
    }
    const image=await sharp({create:{width:view.width,height:view.height,channels:4,background:'#0000'}}).composite(overlays).png().toBuffer();
    if(!valid())return;await store.publish({kind:'cloud',context:ctx,source:'rainbow',role,time:time*1000,receivedAt:now(),data:{}},image);
   }
   if(valid()){lastSuccess=now();error=null;onEvent('cloud-collected');}
  }catch(e){if(valid()){error={code:e.code??'cloud',message:e.code==='test-limit'?'DEV cloud request allowance exhausted.':e.code==='limit'?'Rainbow monthly request limit reached.':'Cloud acquisition unavailable.'};onEvent('cloud-error',{code:error.code});}}finally{busy=false;}})();
  await operation;
 }
 async function window(end,hours){
  const data=await rows(end,hours),frames=new Map();for(const r of data){const t=r.time/1000,f=frames.get(t)??{time:t,url:null,overviewUrl:null};f[r.role==='main'?'url':'overviewUrl']='/archive/'+r.asset;frames.set(t,f);}
  return {frames:[...frames.values()].sort((a,b)=>a.time-b.time)};
 }
 async function augment(result,hours,{archive=false,end}={}){
  const until=end??result?.end??Math.floor(now()/600000)*600;
  const clouds=await window(until,hours);
  if(!result){if(!archive||!clouds.frames.some(f=>f.time===until))return null;result={start:until-hours*3600,end:until,frames:[],coverage:[],counts:{},complete:true};}
  const selected=archive?['main','overview']:config.enabled?cloudRoles(config.map):[];
  const frames=new Map((result.frames??[]).map(f=>[f.time,{...f}]));
  for(const f of clouds.frames){if(f.time<result.start||!selected.some(role=>f[role==='main'?'url':'overviewUrl']))continue;
   if(!frames.has(f.time))frames.set(f.time,{time:f.time,url:null,overviewUrl:null,expectedSources:{main:'disabled',overview:'disabled'}});
  }
  const all=[...frames.values()].sort((a,b)=>a.time-b.time).map(f=>{
   for(const role of ['main','overview']){const key=role==='main'?'url':'overviewUrl',row=selected.includes(role)?clouds.frames.findLast(c=>c.time<=f.time&&(archive?c.time===f.time:c.time>f.time-1800)&&c[key]):null;f[role==='main'?'cloudUrl':'overviewCloudUrl']=row?.[key]??null;f[role==='main'?'cloudTime':'overviewCloudTime']=row?.time??null;}return f;});
  return {...result,frames:all,frame:all.at(-1)??null,playable:all.length,radarDisabled:result.radarDisabled&&!selected.length,cloudHistory:{...clouds,roles:selected},...(archive?{}:{clouds:await status()})};
 }
 const timer=autoStart?setInterval(()=>void collect(),1000):null;timer?.unref();
 return {configure,status,collect,window,augment,enabled:()=>config.enabled,async close(){closed=true;revision++;clearInterval(timer);await operation;}};
}
