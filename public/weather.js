import { gustCacheMinutes } from './display.js';
import { formatTime } from './time.js';
const timeZone = document.querySelector('meta[name="time-zone"]').content;
const $ = id => document.getElementById(id);
let description = 'Current weather unavailable', signature = '';
export const weatherDescription = () => description;
const stamp = time => formatTime(time, {hour:'2-digit',minute:'2-digit'}, timeZone);
const fetchedStamp = time => {
  const part = options => formatTime(time/1000, options, timeZone);
  return `${part({day:'numeric'})} ${part({month:'short'}).slice(0,3)} ${stamp(time/1000)}`;
};
export function paintWeather(state, now = Date.now()) {
  const nextSignature = JSON.stringify([state?.fetchedAt,Math.floor(now/60000),state?.configured,state?.error,state?.failures,state?.fetching,state?.gust?.time,state?.gust?.mph,gustCacheMinutes()]);
  if (signature === nextSignature) return;
  signature = nextSignature;
  $('weather-credit').hidden = !state?.configured;
  const data = state?.data;
  const current = data?.current;
  const fresh = !!current && current.time * 1000 > now - 1800000 && current.time * 1000 <= now + 300000;
  const values = [current?.temperature,current?.feelsLike,current?.windMph];
  const failures = state?.failures ?? (state?.error ? 1 : 0);
  const usable = fresh && values.every(Number.isFinite) && failures < 2;
  const cached = usable && (failures > 0 || !!state?.error);
  for (const [i, id] of ['weather-temperature','weather-feels','weather-wind'].entries()) {
    $(id).setAttribute('data-cached', String(cached));
    $(id).textContent = usable ? `${Math.round(values[i])}${i < 2 ? '°' : ''}` : '—';
    $(id).closest('.weather-reading').setAttribute('aria-label', usable ? `${cached ? 'Cached ' : ''}${['Temperature','Feels like','Wind'][i]} ${Math.round(values[i])} ${i < 2 ? 'degrees Celsius' : 'miles per hour'}` : `${['Temperature','Feels like','Wind'][i]} unavailable`);
  }
  description = usable ? `${cached ? 'Cached' : 'Current'} weather at ${stamp(current.time)}: ${Math.round(values[0])} degrees, feels like ${Math.round(values[1])}, wind ${Math.round(values[2])} miles per hour` : 'Current weather unavailable';
  // Old cache payloads still work until the backend's next scheduled response.
  const gust = state?.gust ?? {mph:current?.gustMph,time:current?.time};
  const gustUsable = !!state?.configured && Number.isFinite(gust.mph) && Number.isFinite(gust.time)
    && gust.time * 1000 > now - gustCacheMinutes() * 60000 && gust.time * 1000 <= now + 300000;
  const gustCached = gustUsable && (!fresh || failures > 0 || !!state?.error || current?.gustMph !== gust.mph || current?.time !== gust.time);
  $('weather-gust').setAttribute('data-cached', String(gustCached));
  const gustDescription = gustUsable ? `${gustCached ? 'Cached' : 'Last reported'} wind gusts ${Math.round(gust.mph)} miles per hour at ${fetchedStamp(gust.time * 1000)}` : 'Wind gusts unavailable';
  $('weather-gust').textContent = gustUsable ? String(Math.round(gust.mph)) : '—';
  $('weather-gust').closest('.weather-reading').setAttribute('aria-label', gustDescription);
  $('weather-gust').closest('.weather-reading').title = gustDescription;
  if (gustUsable) description += `; ${gustDescription}`;
  const expanded = $('weather-dock').getAttribute('aria-expanded') === 'true';
  $('weather-dock').setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} weather readings: ${description}`);
  $('weather-dock').title = state?.error || description;

  const minuteNow = Math.floor(now / 60000) * 60;
  const entries = (data?.minutely || []).filter(item => item.time >= minuteNow && item.time < minuteNow + 3600);
  const health = !state ? ['error', 'Cannot reach weather server.']
    : !state.configured ? ['neutral', 'No OpenWeather key configured.']
    : state.error || failures > 0 ? ['error', state.error || 'Weather refresh failed; awaiting recovery.']
    : state.fetching && !state.fetchedAt ? ['neutral', 'Checking OpenWeather…']
    : entries.length && usable ? ['ready', `OpenWeather connected. Last fetched at ${fetchedStamp(state.fetchedAt)}.`]
    : state.fetchedAt ? ['stale', 'Weather data missing or expired; awaiting refresh.']
    : ['neutral', 'Awaiting first OpenWeather response — allow 10–15 min.'];
  $('weather-dock').setAttribute('data-health', state?.configured === false ? 'unconfigured' : health[0] === 'ready' ? 'ready' : 'warning');
  $('weather-dock').title = `${description}. ${health[1]}`;
  $('settings-api-status').textContent = health[1];
  const available = new Map(entries.map(item => [Math.round((item.time - minuteNow) / 60), item.precipitation]));
  const message = !state?.configured ? 'Configure OpenWeather in Settings' : entries.length ? '' : state?.error || 'Forecast unavailable';
  $('minute-message').textContent = message;
  $('minute-message').hidden = !message;
  $('minute-chart').style.visibility = message ? 'hidden' : 'visible';
  $('minute-chart').setAttribute('viewBox', '0 0 360 85');
  $('minute-chart').setAttribute('aria-label', entries.length ? `Current precipitation forecast, fetched at ${stamp(state.fetchedAt/1000)}. ${entries.length} available minute samples. Precipitation in millimetres per hour.` : message);
  $('minutecast').title = state?.error || (state?.fetchedAt ? `Current forecast · updated ${stamp(state.fetchedAt/1000)} · OpenWeather` : message);
  const scale = Math.max(1, ...entries.map(item => item.precipitation));
  const bars = [];
  for (let minute=0; minute<60; minute++) {
    if (!available.has(minute)) continue; // Unknown minutes are gaps, never dry observations.
    const rain = available.get(minute);
    const height = Math.max(2, rain / scale * 85);
    const bar = document.createElementNS('http://www.w3.org/2000/svg','rect');
    for (const [key,value] of Object.entries({x:minute*6,y:85-height,width:4,height,rx:1.5,fill:rain === 0 ? '#68877c' : rain < 0.5 ? '#75c8bd' : '#329db3',opacity:rain === 0 ? 0.35 : 1})) bar.setAttribute(key,value);
    const title = document.createElementNS('http://www.w3.org/2000/svg','title');
    title.textContent = `${stamp(minuteNow+minute*60)} · ${rain} mm/h`;
    bar.append(title); bars.push(bar);
  }
  $('minute-bars').replaceChildren(...bars);
}
