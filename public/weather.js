import { gustCacheMinutes, weatherPreferences } from './display.js';
import { temperatureText, windText, windBearing, windDirectionText, visibilityText, pressureText, readingNames } from './weather-format.js';
import { formatTime } from './time.js';
import {weatherReadings,weatherHealth,readingExplanation,readingSourceCaption} from './weather-readings.js';
const timeZone = document.querySelector('meta[name="time-zone"]').content;
const $ = id => document.getElementById(id);
let description = 'Current weather unavailable', signature = '';
let currentRows=null;
export function weatherCredits(visibleReadings){
  const credits=new Set();let openweather=false;
  for(const id of new Set(visibleReadings.flatMap(id=>id==='depression'?['temperature','dew']:[id]))){const row=currentRows?.[id];
    if(!row||row.source==='openweather'||row.expected==='openweather')openweather=true;
    if(row?.expected==='ha'&&row.attribution)credits.add(row.attribution);
  }
  return {openweather,other:[...credits].join(' · ')};
}
export const weatherDescription = () => description;
const stamp = time => formatTime(time, {hour:'2-digit',minute:'2-digit'}, timeZone);
const fetchedStamp = time => {
  if (!Number.isFinite(time)) return 'Not acquired';
  const part = options => formatTime(time/1000, options, timeZone);
  return `${part({day:'numeric'})} ${part({month:'short'}).slice(0,3)} ${part({year:'numeric'})} ${stamp(time/1000)}`;
};
export function paintWeather(state, now = Date.now(), {historical=false,operational=state}={}) {
  const prefs = {...weatherPreferences(),...(historical?state?.units:{})};
  const nextSignature = JSON.stringify([state?.units,state?.presentation,historical,historical?Math.floor(Date.now()/60000):null,operational, state?.data?.current?.time,operational?.fetchedAt,operational?.error,operational?.failures,prefs,state?.fetchedAt,state?.forecastFetchedAt,state?.forecastError,Math.floor(now/60000),state?.configured,state?.error,state?.failures,state?.fetching,state?.gust,gustCacheMinutes()]);
  if (signature === nextSignature) return;
  signature = nextSignature;
  const rows=weatherReadings(state,now,{historical,preferences:prefs,gustMinutes:gustCacheMinutes()});
  currentRows=rows;
  for(const [id,row] of Object.entries(rows)){
    const node=$('weather-'+id),holder=node.closest('.weather-reading');
    node.textContent=row.text;node.setAttribute('data-cached',String(row.text!=='—'&&row.retained));
    holder.setAttribute('data-source',row.source??'gap');holder.setAttribute('data-expected-source',row.expected);
    holder.setAttribute('data-attribution',row.attribution);
    holder.title=readingExplanation(row,fetchedStamp);holder.setAttribute('aria-label',holder.title);
  }
  const direction=rows.direction.value;
  const angle=windBearing(direction,prefs.directionConvention);
  $('weather-direction-arrow').setAttribute('transform',`rotate(${angle??0} 14 14)`);
  $('weather-direction-arrow').setAttribute('visibility',angle===null?'hidden':'visible');
  for(const unit of document.querySelectorAll('.wind-unit-label'))unit.textContent=prefs.windUnit;
  $('weather-visibility-unit').textContent=prefs.visibilityUnit||'km';
  $('weather-pressure-unit').textContent=prefs.pressureUnit||'hPa';
  description=weatherHealth(rows).summary;
  const minuteNow = Math.floor(now/60000)*60;
  const forecastFetchedAt = state?.forecastFetchedAt ?? state?.fetchedAt;
  const forecastFresh = Number.isFinite(forecastFetchedAt) && forecastFetchedAt <= now+300000 && forecastFetchedAt > now-1800000;
  const samples = Array.isArray(state?.data?.minutely) ? state.data.minutely : [];
  const valid = item => Number.isSafeInteger(item?.time) && Number.isFinite(item.precipitation) && item.precipitation >= 0 && item.precipitation <= 1000;
  const available = new Map(samples.filter(valid).filter(item => item.time >= minuteNow && item.time < minuteNow+3600 && (item.time-minuteNow)%60===0).map(item=>[(item.time-minuteNow)/60,item.precipitation]));
  // Judge completeness at acquisition, not by the naturally shrinking forecast horizon between polls.
  const complete = samples.length >= 60 && samples.every((item,i)=>valid(item) && (!i || item.time === samples[i-1].time+60));
  const forecastUsable = !!state?.configured && forecastFresh && !state?.forecastError && available.size > 0;
  const starting = !!state?.fetching && !state?.fetchedAt && !state?.error;
  const forecastStarting = !!state?.fetching && !forecastFetchedAt && !state?.forecastError;
  paintWeatherHealth(operational,historical?Date.now():now);
  if(historical)return;
  $('minute-message').hidden = true; $('minute-message').textContent = '';
  $('minute-chart').style.visibility = 'visible';
  $('minute-chart').setAttribute('viewBox','0 0 360 85');
  const forecastLabel = forecastUsable ? `Current precipitation forecast, fetched at ${fetchedStamp(forecastFetchedAt)}. ${available.size} available minute samples. Precipitation in millimetres per hour.`
    : !state ? 'Forecast unavailable: appliance unreachable.'
    : !state.configured ? 'Forecast not configured.'
    : state.forecastEnabled===false ? 'Forecast collection disabled.'
    : forecastStarting ? 'Waiting for first forecast.' : 'Forecast unavailable after failed refresh or expiry.';
  $('minute-chart').setAttribute('aria-label',forecastLabel);
  $('rain-forecast').title = state?.forecastError || forecastLabel;
  const bars = [], scale = Math.max(1,...available.values());
  if (forecastUsable) for (let minute=0;minute<60;minute++) {
    const rain=available.get(minute), missing=rain===undefined, baseline=missing||rain===0;
    const height=baseline?1:Math.max(2,rain/scale*85);
    const bar=document.createElementNS('http://www.w3.org/2000/svg','rect');
    for (const [key,value] of Object.entries({x:minute*6,y:85-height,width:baseline?6:4,height,rx:baseline?0:1.5,fill:missing?'#c49343':rain<0.5?'#75c8bd':'#329db3'})) bar.setAttribute(key,value);
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');
    title.textContent=`${stamp(minuteNow+minute*60)} · ${missing?'Missing forecast minute':rain+' mm/h'}`;
    bar.append(title); bars.push(bar);
  }
  if (!forecastUsable) {
    const line = document.createElementNS('http://www.w3.org/2000/svg','rect');
    const fill = !state ? '#c27878' : !state.configured||state.forecastEnabled===false ? '#89958f' : forecastStarting ? '#c49343' : '#c27878';
    for (const [key,value] of Object.entries({x:0,y:84,width:360,height:1,fill})) line.setAttribute(key,value);
    bars.push(line);
  }
  $('minute-bars').replaceChildren(...bars);
}

function paintWeatherHealth(state,now){
  const rows=weatherReadings(state,now,{preferences:weatherPreferences(),gustMinutes:gustCacheMinutes()});
  const {health,summary}=weatherHealth(rows),dock=$('weather-dock');
  dock.setAttribute('data-health',health);dock.title=summary;
  dock.setAttribute('aria-label',`${dock.getAttribute('aria-expanded')==='true'?'Collapse':'Expand'} weather readings: ${summary}`);
  const handle=$('weather-handle');if(handle){handle.setAttribute('aria-label',dock.getAttribute('aria-label'));handle.title=summary;}dock.setAttribute('aria-label',`Weather readings: ${summary}`);dock.removeAttribute('title');
  const status=$('settings-api-status');status.textContent=summary;status.setAttribute('data-health',health);
  for(const [id,row] of Object.entries(rows)){
    const led=$('reading-health-'+id),source=$('reading-source-'+id);
    if(led){led.setAttribute('data-health',row.health);led.title=row.reason||row.sourceLabel;led.setAttribute('aria-label',row.reason||({ready:'OK',warning:'Retained or delayed',error:'Unavailable',unconfigured:'Disabled or not configured'})[row.health]);}
    if(source)source.textContent=readingSourceCaption(row);
  }
}
