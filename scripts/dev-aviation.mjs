import {join} from 'node:path';
import {createHistoryStore} from '../src/history-store.js';
import {createAviation} from '../src/aviation.js';
const group=t=>{const d=new Date(t);return String(d.getUTCDate()).padStart(2,'0')+String(d.getUTCHours()).padStart(2,'0');};
const issue=t=>group(t)+String(new Date(t).getUTCMinutes()).padStart(2,'0')+'Z';
export async function createDevAviation(directory,{end,scenario}){
 let clock=(end-86400)*1000,seed=true;
 const store=await createHistoryStore(join(directory,'aviation-fixture'));
 const collector=await createAviation(join(directory,'aviation-fixture'),{store,freshInstallation:true,autoStart:false,now:()=>clock++,fetcher:async url=>{
  const outage=seed&&clock>(end-5400)*1000&&clock<(end-3600)*1000;
  if(outage||scenario()==='aviation-interrupted')return new Response('',{status:503});
  const product=url.includes('/metar?')?'metar':'taf',station=new URL(url).searchParams.get('ids');
  if(scenario()==='aviation-missing'&&product==='taf')return new Response(null,{status:204});
  const time=Math.floor(clock/(product==='metar'?1800000:21600000))*(product==='metar'?1800000:21600000),from=time+3600000,to=from+86400000;
  const weather=Math.floor(time/1800000)%2===0?'15012KT 3000 DZ OVC006 15/14 Q1011 REDZ':'23008KT 9999 SCT025 16/12 Q1013 NOSIG';
  const rawTAF=`TAF ${station} ${issue(time)} ${group(from)}/${group(to)} 17010KT 9999 OVC010 TEMPO ${group(from)}/${group(from+25200000)} 7000 -RADZ BKN006 PROB30 TEMPO ${group(from)}/${group(from+25200000)} 1400 DZ BR BKN003 BECMG ${group(from+18000000)}/${group(from+25200000)} FEW030 PROB30 TEMPO ${group(from+25200000)}/${group(from+43200000)} 7000 -RADZ BKN010 TEMPO ${group(from+43200000)}/${group(from+64800000)} 7000 -RADZ BKN007 PROB30 TEMPO ${group(from+43200000)}/${group(from+57600000)} 3000 RADZ BR BKN004 BECMG ${group(from+64800000)}/${group(from+75600000)} 26016G28KT TEMPO ${group(from+64800000)}/${group(to)} 7000 RA BKN014`;
  return Response.json([product==='metar'?{icaoId:station,obsTime:time/1000,rawOb:`METAR ${station} ${issue(time)} ${weather}`,name:station==='EGBB'?'Birmingham Intl':'Synthetic '+station}:{icaoId:station,issueTime:new Date(time).toISOString(),validTimeFrom:from/1000,validTimeTo:to/1000,rawTAF,name:station==='EGBB'?'Birmingham Intl':'Synthetic '+station}]);
 }});
 for(let t=end-86400+300;t<=end-60;t+=300){clock=t*1000;await collector.collect();}
 seed=false;
 async function refresh(){clock=Date.now();await collector.collect();}
 await refresh();
 return {collector,refresh,async ensureLive(){if(collector.status().enabled&&Date.now()-(collector.status().products.metar?.lastAttempt??0)>=300000)await refresh();},async close(){await collector.close();await store.close();}};
}
