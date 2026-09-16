import { gustCacheMinutes, weatherPreferences } from './display.js';
import { temperatureText, windText, directionText, readingNames } from './weather-format.js';
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
  const prefs = weatherPreferences();
  const nextSignature = JSON.stringify([prefs,state?.fetchedAt,state?.forecastFetchedAt,state?.forecastError,Math.floor(now/60000),state?.configured,state?.error,state?.failures,state?.fetching,state?.gust?.time,state?.gust?.mph,gustCacheMinutes()]);
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
    $(id).textContent = usable ? (i < 2 ? temperatureText(values[i], prefs.temperatureUnit) : windText(values[i], prefs.windUnit)) : '—';
    $(id).closest('.weather-reading').setAttribute('aria-label', usable ? `${cached ? 'Cached ' : ''}${['Temperature','Feels like','Wind'][i]} ${$(id).textContent} ${i < 2 ? prefs.temperatureUnit === 'F' ? 'Fahrenheit' : 'Celsius' : prefs.windUnit}` : `${['Temperature','Feels like','Wind'][i]} unavailable`);
  }
  description = usable ? `${cached ? 'Cached' : 'Current'} weather at ${stamp(current.time)}: ${temperatureText(values[0], prefs.temperatureUnit)}${prefs.temperatureUnit}, feels like ${temperatureText(values[1], prefs.temperatureUnit)}${prefs.temperatureUnit}, wind ${windText(values[2], prefs.windUnit)} ${prefs.windUnit}` : 'Current weather unavailable';
  for (const unit of document.querySelectorAll('.wind-unit-label')) unit.textContent = prefs.windUnit;
  for (const [id, value, text] of [['humidity',current?.humidity,`${Math.round(current?.humidity)}%`], ['dew',current?.dewPoint,temperatureText(current?.dewPoint, prefs.temperatureUnit)], ['direction',current?.windDirection,directionText(current?.windDirection)]]) {
    const available = usable && Number.isFinite(value);
    $(`weather-${id}`).textContent = available ? text : '—';
    $(`weather-${id}`).setAttribute('data-cached', String(available && cached));
    const label = `${readingNames[id]} ${available ? text + (id === 'dew' ? prefs.temperatureUnit : '') : 'unavailable'}`;
    $(`weather-${id}`).closest('.weather-reading').setAttribute('aria-label', label);
    $(`weather-${id}`).closest('.weather-reading').title = label;
    if (id === 'direction') {
      // Eight bearings; the arrow points towards the source of the wind.
      const angle = available ? (Math.round(value / 45) % 8) * 45 : 0;
      $('weather-direction-arrow').setAttribute('transform', `rotate(${angle} 14 14)`);
      $('weather-direction-arrow').setAttribute('visibility', available ? 'visible' : 'hidden');
      const row = $(`weather-${id}`).closest('.weather-reading');
      row.setAttribute('data-cached', String(available && cached));
      row.title = available ? `Wind from ${text} · Arrow shows the nearest of eight compass directions` : label;
      row.setAttribute('aria-label', available ? `${cached ? 'Cached wind' : 'Wind'} from ${text}` : label);
    }
  }
  // Old cache payloads still work until the backend's next scheduled response.
  const gust = state?.gust ?? {mph:current?.gustMph,time:current?.time};
  const gustUsable = !!state?.configured && Number.isFinite(gust.mph) && Number.isFinite(gust.time)
    && gust.time * 1000 > now - gustCacheMinutes() * 60000 && gust.time * 1000 <= now + 300000;
  const gustCached = gustUsable && (!fresh || failures > 0 || !!state?.error || current?.gustMph !== gust.mph || current?.time !== gust.time);
  $('weather-gust').setAttribute('data-cached', String(gustCached));
  const gustDescription = gustUsable ? `${gustCached ? 'Cached' : 'Last reported'} wind gusts ${windText(gust.mph, prefs.windUnit)} ${prefs.windUnit} at ${fetchedStamp(gust.time * 1000)}` : 'Wind gusts unavailable';
  $('weather-gust').textContent = gustUsable ? windText(gust.mph, prefs.windUnit) : '—';
  $('weather-gust').closest('.weather-reading').setAttribute('aria-label', gustDescription);
  $('weather-gust').closest('.weather-reading').title = gustDescription;
  if (gustUsable) description += `; ${gustDescription}`;
  const expanded = $('weather-dock').getAttribute('aria-expanded') === 'true';
  $('weather-dock').setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} weather readings: ${description}`);
  $('weather-dock').title = state?.error || description;

  const minuteNow = Math.floor(now / 60000) * 60;
  const entries = (data?.minutely || []).filter(item => item.time >= minuteNow && item.time < minuteNow + 3600);
  const forecastError = state?.forecastError;
  const forecastFetchedAt = state?.forecastFetchedAt ?? state?.fetchedAt;
  const health = !state ? ['error', 'Cannot reach weather server.']
    : !state.configured ? ['neutral', 'No OpenWeather key configured.']
    : state.error || failures > 0 ? ['error', state.error || 'Weather refresh failed; awaiting recovery.']
    : forecastError ? ['error', `MinuteCast: ${forecastError}`]
    : state.fetching && !state.fetchedAt && !forecastFetchedAt ? ['neutral', 'Checking OpenWeather…']
    : entries.length && usable ? ['ready', `OpenWeather connected. Last fetched at ${fetchedStamp(state.fetchedAt)}.`]
    : state.fetchedAt ? ['stale', 'Weather data missing or expired; awaiting refresh.']
    : ['neutral', 'Awaiting first OpenWeather response — allow 10–15 min.'];
  $('weather-dock').setAttribute('data-health', state?.configured === false ? 'unconfigured' : health[0] === 'ready' ? 'ready' : 'warning');
  $('weather-dock').title = `${description}. ${health[1]}`;
  $('settings-api-status').textContent = health[1];
  const available = new Map(entries.map(item => [Math.round((item.time - minuteNow) / 60), item.precipitation]));
  const contiguous = entries.length > 0 && entries.every((item, index) => item.time === minuteNow + index * 60 && Number.isFinite(item.precipitation));
  const forecastFresh = Number.isFinite(forecastFetchedAt) && forecastFetchedAt <= now + 300000 && forecastFetchedAt > now - 1800000;
  const dry = contiguous && forecastFresh && !forecastError && entries.every(item => item.precipitation === 0);
  const retry = 'Will retry automatically.';
  const message = !state ? `Cannot reach the appliance. ${retry}`
    : !state.configured ? 'Configure OpenWeather in Settings'
    : /HTTP (401|403)/.test(forecastError || '') ? 'Check OpenWeather access in Settings.'
    : !entries.length ? `No forecast data received. ${retry}`
    : forecastError ? `Showing the last available forecast. ${retry}`
    : dry ? `${entries.length >= 60 ? 'No rain expected in the next hour.' : 'No rain expected in the available forecast.'}\nLast checked at ${fetchedStamp(forecastFetchedAt)}`
    : '';
  $('minute-message').textContent = message;
  $('minute-message').hidden = !message;
  $('minute-chart').style.visibility = entries.length ? 'visible' : 'hidden';
  $('minute-chart').setAttribute('viewBox', '0 0 360 85');
  $('minute-chart').setAttribute('aria-label', entries.length ? `Current precipitation forecast, fetched at ${stamp(forecastFetchedAt/1000)}. ${entries.length} available minute samples. Precipitation in millimetres per hour.` : message);
  $('minutecast').title = forecastError || (forecastFetchedAt ? `Current forecast · updated ${stamp(forecastFetchedAt/1000)} · OpenWeather` : message);
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
