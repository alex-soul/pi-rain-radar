import {windUnits} from './weather-format.js';
import {createWeatherReplay} from './history-weather-model.js';
import {weatherReadings} from './weather-readings.js';

export function observationKey(row,state){
 const policy=state?.presentation?.policy??state?.policy;
 if(row.inputs)return row.inputs.map(r=>observationKey(r,state)).join('|');
 return JSON.stringify([row.source,row.expected,row.unit,policy?.mappings?.[row.id]??'owm']);
}
export function observationTime(row){return row.inputs?Math.max(...row.inputs.map(r=>r.time??0)):row.time;}
export function readingTrend(previous,current){
 if(!previous||!current||previous.key!==current.key||!Number.isFinite(previous.row.value)||!Number.isFinite(current.row.value)||!current.row.source||previous.row.retained||current.row.retained||current.row.id==='direction')return '';
 const a=observationTime(previous.row),b=observationTime(current.row);
 if(!a||!b||b<=a||b-a>=1800000||current.row.source==='ha'&&b-a>600000)return '';
 return current.row.value>previous.row.value?'↑':current.row.value<previous.row.value?'↓':'';
}
export function weatherSeries(history={},preferences={},gustMinutes=60){
 const replay=createWeatherReplay(history),times=[...new Set([...(history.weather??[]).map(r=>r.time),...(history.presentations??[]).map(r=>r.time),...(history.policies??[]).map(r=>r.time)])].sort((a,b)=>a-b);
 const series={};
 for(const at of times){
  const state=replay.weather(at),rows=weatherReadings(state,at*1000,{historical:true,preferences,gustMinutes});
  for(const [id,row] of Object.entries(rows)){
   const list=series[id]??=[],key=observationKey(row,state),last=list.at(-1),time=observationTime(row);
   if(last&&last.key===key&&observationTime(last.row)===time&&last.row.value===row.value)continue;
   list.push({at,row,key});
  }
 }
 return series;
}
export function trendsAt(series,rows,state){
 return Object.fromEntries(Object.entries(rows).map(([id,row])=>{
  const current={row,key:observationKey(row,state)},time=observationTime(row),list=(series[id]??[]).filter(p=>p.at*1000<=time);
  // Keep a missing or source-switch event as the previous entry; never skip it.
  while(list.length&&observationTime(list.at(-1).row)===time&&list.at(-1).key===current.key)list.pop();
  return [id,readingTrend(list.at(-1),current)];
 }));
}
export function chartSegments(points,start,end,unit){
 const segments=[];let line=[],previous=null;
 for(const p of points??[]){
  const r=p.row,t=observationTime(r)/1000;
  const valid=Number.isFinite(r.value)&&r.source&&!r.retained&&r.unit===unit&&t>=start&&t<=end;
  if(!valid||previous&&(p.key!==previous.key||t-observationTime(previous.row)/1000>=1800||r.source==='ha'&&t-observationTime(previous.row)/1000>600)) {if(line.length)segments.push(line);line=[];}
  if(valid){let value=['wind','gust'].includes(r.id)&&r.source==='openweather'?r.value*(windUnits[unit]??1):['temperature','dew'].includes(r.id)&&r.source==='openweather'&&unit==='°F'?r.value*1.8+32:r.value;if(r.source==='openweather'&&r.id==='visibility')value=Math.min(value,10000)/(unit==='mi'?1609.344:1000);
   if(r.source==='openweather'&&r.id==='pressure')value*=unit==='inHg'?0.0295299830714:unit==='mmHg'?0.750061683:1;
   line.push({time:t,value,source:r.sourceLabel});}
  previous=valid?p:null;
 }
 if(line.length)segments.push(line);return segments;
}

export function gridInterval(span,width){
 const hours=span/3600,base=hours<=2?600:hours<=6?1800:hours<=12?3600:7200;
 const choices=[600,1800,3600,7200,10800,14400,21600,43200,86400];
 return choices.find(step=>step>=base&&span/step<=Math.max(2,Math.min(12,Math.floor(width/24))))??86400;
}
export function smoothPath(points){
 const p=points.filter((point,i)=>!i||point[0]>points[i-1][0]);if(p.length<2)return '';
 const d=p.slice(1).map((v,i)=>(v[1]-p[i][1])/(v[0]-p[i][0]));
 const m=p.map((v,i)=>i===0?d[0]:i===p.length-1?d.at(-1):d[i-1]*d[i]<=0?0:2*d[i-1]*d[i]/(d[i-1]+d[i]));
 let result=`M${p[0].join(',')}`;
 for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],dx=(b[0]-a[0])/3;result+=` C${a[0]+dx},${a[1]+m[i-1]*dx} ${b[0]-dx},${b[1]-m[i]*dx} ${b.join(',')}`;}
 return result;
}

// A minimum span keeps tiny changes from looking dramatic; padding keeps extrema clear.
export function trendRange(values,id,unit){
 const valid=values.filter(Number.isFinite);if(!valid.length)return [0,1];
 const low=Math.min(...valid),high=Math.max(...valid),centre=(low+high)/2;
 const floor=id==='humidity'?2:id==='pressure'?(unit==='inHg'?.06:unit==='mmHg'?1.5:2):id==='visibility'?.2:['wind','gust'].includes(id)?1:['temperature','dew','depression'].includes(id)?(unit==='°F'?1.8:1):1;
 const span=Math.max(high-low,floor)*1.16;return [centre-span/2,centre+span/2];
}

export function chartCredits(series,visibleFields,start,end){
 const rows=visibleFields.flatMap(id=>(series[id]??[]).filter(p=>p.at>=start&&p.at<=end).flatMap(p=>p.row.inputs??[p.row])).filter(row=>row.source);
 return {openweather:rows.some(row=>row.source==='openweather'),other:[...new Set(rows.filter(row=>row.expected==='ha').map(row=>row.attribution).filter(Boolean))].join(' · ')};
}
