import {mapObservation} from './playback.js';
import {cameraAt} from './camera-model.js';
import {createWeatherReplay} from './history-weather-model.js';
import {weatherReadings} from './weather-readings.js';
const severity={pending:0,disabled:0,unknown:0,ready:1,warning:2,error:3};
const worst=items=>items.reduce((a,b)=>severity[b]>severity[a]?b:a,'disabled');
export function availabilityRows({frames=[],data={},status={},archive=false,start,end}){
 data=data??{};status=status??{};
 const times=Array.from({length:Math.round((end-start)/600)+1},(_,i)=>start+i*600),clouds=data.cloudHistory?.frames??[],camera=data.cameraHistory?.records??[],weather=data.weatherHistory??{},replay=createWeatherReplay(weather);
 const all=times.map(time=>frames.find(f=>f.time===time)??{time,expectedSources:frames.find(f=>f.time>=time)?.expectedSources??frames.at(-1)?.expectedSources});all.borrowFrames=frames.borrowFrames;
 const rows=[];
 const periodAt=time=>data.collectionPeriods?.findLast(p=>p.time<=time);
 function add(label,enabled,fn){if(!enabled)return;rows.push({label,segments:times.map((time,i)=>{const period=data.collectionPeriods?.findLast(p=>p.time<=time),disabled=!['Camera','Clouds'].includes(label)&&period?.[label.toLowerCase()]===false;const detail=(disabled?[{label,health:'disabled'}]:fn(time,i)).map(d=>!archive&&time===end&&['error','unknown'].includes(d.health)?{...d,health:'pending'}:d);return {time,health:detail.every(d=>d.health==='pending')?'pending':detail.every(d=>['unknown','disabled'].includes(d.health))&&detail.some(d=>d.health==='unknown')?'unknown':worst(detail.map(d=>d.health)),detail};})});}
 add('Rain',true,(time,i)=>['main','overview'].map(role=>{const f=all[i],key=role==='main'?'url':'overviewUrl',enabled=archive?f.expectedSources?.[role]!=='disabled':status.sources?.[role]?.enabled!==false&&status.sources?.[role]?.source!=='disabled';const o=mapObservation(all,i,role,archive);return {label:role==='main'?'Main':'Overview',health:!enabled?'disabled':o?(o.borrowed?'warning':'ready'):'error',time:o?.time};}));
 const roles=archive?['main','overview'].filter(role=>clouds.some(c=>c[role==='main'?'url':'overviewUrl'])||data.collectionPeriods?.some(p=>p.clouds&&(p.cloudMap==='both'||p.cloudMap===role))):status.clouds?.enabled?(status.clouds.map==='both'?['main','overview']:[status.clouds.map??'main']):[];
 add('Clouds',roles.length,(time)=>roles.map(role=>{const key=role==='main'?'url':'overviewUrl',c=clouds.findLast(c=>c.time<=time&&(archive?c.time===time:c.time>time-1800)&&c[key]),p=periodAt(time),enabled=p?.clouds;
 const health=c?(c.time===time?'ready':'warning'):enabled===false||enabled===true&&p.cloudMap&&p.cloudMap!=='both'&&p.cloudMap!==role?'disabled':enabled===undefined?'unknown':'error';return {label:role==='main'?'Main':'Overview',health,time:c?.time};}));
 const policy=status.weatherPolicy??status.weather?.policy,enabledWeather=policy?.mappings?Object.values(policy.mappings).some(v=>v!=='disabled')&&(policy.owmCollect||policy.haCollect):status.weather?.configured;
 add('Weather',archive?(weather.weather?.length||weather.presentations?.length||weather.policies?.some(p=>Object.values(p.mappings??{}).some(v=>v!=='disabled'))):enabledWeather,(time)=>Object.values(weatherReadings(replay.weather(time),time*1000,{historical:true})).filter(r=>!['gust','depression'].includes(r.id)).map(r=>({label:r.name??r.id??'Reading',health:r.health==='unconfigured'?'disabled':r.health,time:r.time? r.time/1000:null})));
 add('Camera',archive?(camera.length||data.collectionPeriods?.some(p=>p.camera)):status.camera?.enabled,(time)=>{const row=cameraAt(camera,time*1000);return [{label:'Camera',health:row?'ready':periodAt(time)?.camera===false?'disabled':periodAt(time)?.camera===true?'error':'unknown',time:row?.time/1000}];});
 return rows;
}
