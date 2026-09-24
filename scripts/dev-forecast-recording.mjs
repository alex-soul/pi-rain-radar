import {readFile} from 'node:fs/promises';

// Explicit local export only. Never retrieves credentials or calls a provider.
export async function loadForecastRecording(path){
  if(!path)return null;
  const data=JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
  if(!Number.isSafeInteger(data.end)||!Array.isArray(data.forecasts)||!data.forecasts.length)throw Error('Invalid forecast recording');
  const forecasts=data.forecasts.map(s=>{
    if(!Number.isSafeInteger(s.time)||!Number.isFinite(s.receivedAt)||!Array.isArray(s.points)||!s.points.length||s.points[0].time!==s.time||s.points.some(p=>!Number.isSafeInteger(p.time)||!Number.isFinite(p.precipitation)||p.precipitation<0))throw Error('Invalid recorded forecast snapshot');
    return {time:s.time,receivedAt:s.receivedAt,points:s.points.map(p=>({time:p.time,precipitation:p.precipitation}))};
  }).sort((a,b)=>a.time-b.time);
  return {end:data.end,forecasts};
}

export function applyForecastRecording(data,recording){
  if(!data.weatherHistory)return data;
  const {start,end}=data.weatherHistory;
  return {...data,weatherHistory:{...data.weatherHistory,forecasts:recording.forecasts.filter(s=>s.time>=start&&s.time<=end)}};
}
