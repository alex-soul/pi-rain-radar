import {historyRows} from './radar-history.js';
export const weatherContext=location=>`${location.lat},${location.lon}`;

export async function saveWeatherHistory(store,{context,current,forecast,gust,receivedAt}){
  const records=[];
  if(current)records.push({kind:'weather',source:'openweather',context,time:current.time*1000,receivedAt,data:{current,gust}});
  if(forecast?.length)records.push({kind:'forecast',source:'openweather',context,time:forecast[0].time*1000,receivedAt,data:{anchorBasis:'first-point',points:forecast}});
  if(records.length)await store.put(records);
}

export async function loadWeatherHistory(store,location,end,hours){
  if(!Number.isSafeInteger(end)||!Number.isInteger(hours)||hours<1||hours>24)throw Error('Invalid weather window');
  // Earliest displayed target - two-hour chart - maximum 60-minute lead -
  // inclusive ten-minute matching tolerance. All reads still obey shared cutoff.
  const start=Math.max(0,(end-hours*3600-11400)*1000),context=weatherContext(location);
  const query={source:'openweather',context,start,end:end*1000};
  const [weather,forecasts,presentations,policies,boundary,policy]=await Promise.all([
    historyRows(store,{...query,kind:'weather'}),historyRows(store,{...query,kind:'forecast'}),
    historyRows(store,{...query,source:'presentation',kind:'weather'}),
    historyRows(store,{kind:'transition',source:'weather-policy',context:'appliance',start,end:end*1000}),
    store.contextBefore({source:'weather-policy',context:'appliance',end:start}),store.weatherState('policy')]);
  return {source:'openweather',context,start:start/1000,end,
    weather:weather.map(r=>({time:r.time/1000,receivedAt:r.receivedAt,current:r.data.current,gust:r.data.gust??null})),
    forecasts:forecasts.map(r=>({time:r.time/1000,receivedAt:r.receivedAt,points:r.data.points??[]})),
    presentations:presentations.map(r=>({time:r.time/1000,receivedAt:r.receivedAt,...r.data})),
    policies:[...(boundary?[boundary]:[]),...policies].map(r=>({time:r.time/1000,...r.data})),baseline:policy?.baseline??null};
}
