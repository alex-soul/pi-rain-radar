import { gustCacheMinutes, weatherPreferences } from './display.js';
import { temperatureText, windText, windBearing, windDirectionText, visibilityText, pressureText, readingNames } from './weather-format.js';
import { formatTime } from './time.js';
import {selectHaReadings} from './weather-policy.js';
const timeZone = document.querySelector('meta[name="time-zone"]').content;
const $ = id => document.getElementById(id);
let description = 'Current weather unavailable', signature = '';
let currentRows=null;
export function weatherCredits(visibleReadings){
  const credits=new Set();let openweather=false;
  for(const id of visibleReadings){const row=currentRows?.[id];
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
  const nextSignature = JSON.stringify([state?.units,state?.presentation,historical,historical?Math.floor(Date.now()/60000):null,operational?.configured,state?.data?.current?.time,operational?.fetchedAt,operational?.error,operational?.failures,prefs,state?.fetchedAt,state?.forecastFetchedAt,state?.forecastError,Math.floor(now/60000),state?.configured,state?.error,state?.failures,state?.fetching,state?.gust,gustCacheMinutes()]);
  if (signature === nextSignature) return;
  signature = nextSignature;
  const current = state?.data?.current;
  const fresh = !!current && current.time * 1000 > now - 1800000 && current.time * 1000 <= now + (historical?0:300000);
  const failures = state?.failures ?? (state?.error ? 1 : 0);
  const usable = !!state?.configured && fresh && [current?.temperature,current?.feelsLike,current?.windMph].every(Number.isFinite) && failures < 2;
  const cached = usable && (failures > 0 || !!state?.error);
  function reading(id, text, unit = '', acquired = state?.fetchedAt, retained = cached) {
    const node = $('weather-'+id), row = node.closest('.weather-reading');
    node.textContent = text;
    node.setAttribute('data-cached', String(text !== '—' && retained));
    const label = `${readingNames[id]}: ${text}${unit ? ' '+unit : ''} | ${text === '—' ? 'Not acquired' : fetchedStamp(acquired)}`;
    row.title = label; row.setAttribute('aria-label',label);
  }
  for (const [id,value] of [['temperature',current?.temperature],['feels',current?.feelsLike],['dew',current?.dewPoint]]) {
    const text = usable ? temperatureText(value, prefs.temperatureUnit) : '—';
    reading(id,text === '—' ? text : text.replace('°',''),text === '—' ? '' : '°'+prefs.temperatureUnit);
    $('weather-'+id).textContent = text;
  }
  reading('wind',usable ? windText(current?.windMph,prefs.windUnit) : '—',prefs.windUnit);
  reading('humidity',usable && Number.isFinite(current?.humidity) ? `${Math.round(current.humidity)} %` : '—');
  if (usable && Number.isFinite(current?.humidity)) $('weather-humidity').textContent = `${Math.round(current.humidity)}%`;
  reading('direction',usable ? windDirectionText(current?.windDirection,prefs.directionFormat,prefs.directionConvention) : '—');
  const angle = usable ? windBearing(current?.windDirection,prefs.directionConvention) : null;
  $('weather-direction-arrow').setAttribute('transform',`rotate(${angle ?? 0} 14 14)`);
  $('weather-direction-arrow').setAttribute('visibility',angle === null ? 'hidden' : 'visible');
  reading('visibility',usable ? visibilityText(current?.visibility,prefs.visibilityUnit) : '—',prefs.visibilityUnit || 'km');
  reading('pressure',usable ? pressureText(current?.pressure,prefs.pressureUnit) : '—',prefs.pressureUnit || 'hPa');
  reading('uv',usable && Number.isFinite(current?.uvi) ? String(Number(current.uvi.toFixed(1))) : '—');
  for (const unit of document.querySelectorAll('.wind-unit-label')) unit.textContent = prefs.windUnit;
  $('weather-visibility-unit').textContent = prefs.visibilityUnit || 'km';
  $('weather-pressure-unit').textContent = prefs.pressureUnit || 'hPa';
  // Legacy caches have no gust acquisition timestamp: do not invent one.
  const off = gustCacheMinutes() === 0;
  const gust = (off ? null : state?.gust) ?? {mph:current?.gustMph,time:current?.time,fetchedAt:state?.fetchedAt};
  const gustUsable = !!state?.configured && Number.isFinite(gust.mph) && Number.isFinite(gust.time)
    && (off ? usable && !cached : gust.time * 1000 > now - gustCacheMinutes() * 60000) && gust.time * 1000 <= now + (historical?0:300000);
  const gustCached = gustUsable && (!fresh || failures > 0 || !!state?.error || current?.gustMph !== gust.mph || current?.time !== gust.time);
  reading('gust',gustUsable ? windText(gust.mph,prefs.windUnit) : '—',prefs.windUnit,gust.fetchedAt ?? null,gustCached);
  description = usable ? `${historical?'Historical':cached ? 'Cached' : 'Current'} weather at ${stamp(current.time)}: ${temperatureText(current.temperature,prefs.temperatureUnit)}${prefs.temperatureUnit}, wind ${windText(current.windMph,prefs.windUnit)} ${prefs.windUnit}` : 'Current weather unavailable';
  if (gustUsable) description += `; ${gustCached ? 'cached' : 'current'} wind gusts ${windText(gust.mph,prefs.windUnit)} ${prefs.windUnit}`;
  const expanded = $('weather-dock').getAttribute('aria-expanded') === 'true';
  $('weather-dock').setAttribute('aria-label',`${expanded ? 'Collapse' : 'Expand'} weather readings: ${description}`);

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
  const presentation=state?.presentation;
  const rows=presentation?selectHaReadings({...presentation.policy,units:prefs},presentation.observations,state,now,{historical}):null;
  currentRows=rows;
  if(rows)for(const [id,row] of Object.entries(rows)){
    // Preserve established OWM formatting and optional retained-gust behavior.
    if(row.expected==='openweather')continue;
    const node=$('weather-'+id),holder=node.closest('.weather-reading');
    const temperature=id==='temperature'||id==='feels';
    node.textContent=row.source==='ha'?(temperature?row.value.toFixed(1)+'°':String(Math.round(row.value))):row.source==='openweather'?(temperature?temperatureText(row.value,prefs.temperatureUnit):windText(row.value,prefs.windUnit)):'—';
    node.dataset.cached=String(row.fallback||(row.source==='openweather'&&cached));
    holder.dataset.source=row.source??'gap';holder.dataset.expectedSource=row.expected;
    holder.dataset.attribution=row.source==='ha'?row.attribution??'':'';
    holder.title=`${readingNames[id]}: ${node.textContent} ${row.unit} · ${row.source==='ha'?'Home Assistant · Reported to HA':row.fallback?'OpenWeather fallback':row.source==='openweather'?'OpenWeather':'Unavailable'}${row.reason?' · '+row.reason:''}`;
    holder.setAttribute('aria-label',holder.title);
  }
  if(rows&&presentation.policy.source==='ha'){
    const bad=Object.values(rows).some(r=>!r.source),fallback=Object.values(rows).some(r=>r.fallback);
    const summary=bad?'Some weather readings unavailable':fallback?'OpenWeather fallback active':'Weather readings available';
    description=summary;
  }
  paintWeatherHealth(operational,historical?Date.now():now);
  if(historical)return;
  $('minute-message').hidden = true; $('minute-message').textContent = '';
  $('minute-chart').style.visibility = 'visible';
  $('minute-chart').setAttribute('viewBox','0 0 360 85');
  const forecastLabel = forecastUsable ? `Current precipitation forecast, fetched at ${fetchedStamp(forecastFetchedAt)}. ${available.size} available minute samples. Precipitation in millimetres per hour.`
    : !state ? 'Forecast unavailable: appliance unreachable.'
    : !state.configured ? 'Forecast not configured.'
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
    const fill = !state ? '#c27878' : !state.configured ? '#89958f' : forecastStarting ? '#c49343' : '#c27878';
    for (const [key,value] of Object.entries({x:0,y:84,width:360,height:1,fill})) line.setAttribute(key,value);
    bars.push(line);
  }
  $('minute-bars').replaceChildren(...bars);
}

function paintWeatherHealth(state,now){
  if(state?.presentation?.policy.source==='ha'){
    const p=state.presentation,rows=Object.values(selectHaReadings(p.policy,p.observations,state,now));
    const health=rows.some(r=>!r.source)?'error':rows.some(r=>r.fallback)?'warning':'ready';
    const summary=health==='error'?'Some readings unavailable':health==='warning'?'OpenWeather fallback active':'Connected';
    const dock=$('weather-dock');dock.dataset.health=health;dock.title=summary;
    dock.setAttribute('aria-label',`${dock.getAttribute('aria-expanded')==='true'?'Collapse':'Expand'} weather readings: ${description}. ${summary}`);
    $('settings-api-status').textContent='Home Assistant · '+summary;$('settings-api-status').dataset.health=health;return;
  }
  const current=state?.data?.current,failures=state?.failures??(state?.error?1:0);
  const fresh=!!current&&current.time*1000>now-1800000&&current.time*1000<=now+300000;
  const usable=!!state?.configured&&fresh&&[current?.temperature,current?.feelsLike,current?.windMph].every(Number.isFinite)&&failures<2;
  const starting=!!state?.fetching&&!state?.fetchedAt&&!state?.error;
  const expanded=$('weather-dock').getAttribute('aria-expanded')==='true';
  const health = !state ? ['error','Cannot reach weather server.']
    : !state.configured ? ['unconfigured','No OpenWeather key configured.']
    : starting ? ['warning','Checking OpenWeather…']
    : !usable ? ['error','Current weather missing or expired.']
    : state.error || failures > 0 ? ['warning',state.error || 'Weather refresh failed; awaiting recovery.']
    : ['ready',`OpenWeather connected. Last fetched at ${fetchedStamp(state.fetchedAt)}.`];
  $('weather-dock').setAttribute('data-health',health[0]);
  $('weather-dock').setAttribute('aria-label',`${expanded ? 'Collapse' : 'Expand'} weather readings: ${description}. ${health[1]}`);
  $('weather-dock').title = `${description}. ${health[1]}`;
  const weatherStatus = $('settings-api-status');
  const summary = !state ? 'Appliance unreachable' : !state.configured ? 'Not configured'
    : starting ? 'Checking OpenWeather…'
    : state.error || failures > 0 ? 'Weather update failed'
    : health[0] === 'ready' ? 'Connected' : 'Data missing or expired';
  weatherStatus.textContent = `OpenWeatherMap · ${summary}`;
  weatherStatus.setAttribute('data-health',health[0]);
}
