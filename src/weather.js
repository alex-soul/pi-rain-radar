import {saveWeatherHistory} from './weather-history.js';
import {filterCurrent,weatherFields} from '../public/weather-policy.js';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { view } from './map.js';

export const WEATHER_INTERVAL = 600000;
export const SETUP_COOLDOWN = 30000;
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function normalizeCurrent(raw, now = Date.now()) {
  const current = raw?.data?.[0];
  const validTime = time => Number.isSafeInteger(time) && time > now / 1000 - 7200 && time < now / 1000 + 7200;
  if (!current || !validTime(current.dt) || !number(current.temp, -100, 70) || !number(current.feels_like, -120, 90) || !number(current.wind_speed, 0, 200)) throw new Error('Invalid weather response');
  return { time: current.dt, temperature: current.temp, feelsLike: current.feels_like, windMph: current.wind_speed * 2.2369362921, gustMph: number(current.wind_gust, 0, 200) ? current.wind_gust * 2.2369362921 : null,
    humidity: number(current.humidity, 0, 100) ? current.humidity : null,
    dewPoint: number(current.dew_point, -120, 90) ? current.dew_point : null,
    visibility: number(current.visibility, 0, 10000) ? current.visibility : null,
    pressure: number(current.pressure, 100, 1200) ? current.pressure : null,
    uvi: number(current.uvi, 0, 100) ? current.uvi : null,
    windDirection: number(current.wind_deg, 0, 360) ? current.wind_deg % 360 : null };
}
export function normalizeMinutely(raw, now = Date.now()) {
  if (!Array.isArray(raw?.data)) throw new Error('Invalid forecast response');
  const validTime = time => Number.isSafeInteger(time) && time > now / 1000 - 7200 && time < now / 1000 + 7200;
  const minutely = [];
  const seen = new Set();
  for (const entry of raw.data.slice(0, 120)) {
    if (entry && validTime(entry.dt) && number(entry.precipitation, 0, 1000) && !seen.has(entry.dt)) {
      minutely.push({ time: entry.dt, precipitation: entry.precipitation }); seen.add(entry.dt);
    }
  }
  minutely.sort((a,b) => a.time-b.time);
  return minutely.slice(0, 61);
}
async function read(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}
async function save(file, value) {
  const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temp, JSON.stringify(value), {mode:0o600});
  await rename(temp, file);
}
export async function createWeather(directory, { store = null, now = Date.now, request = fetch, location = view, onEvent = () => {}, enabled=()=>true, forecastEnabled=enabled, mappings=()=>({}), onNewKey=async()=>{}, onData=async()=>{} } = {}) {
  const folder = join(directory, 'settings');
  await mkdir(folder, {recursive:true,mode:0o700});
  const credentialsFile = join(folder, 'openweather.json');
  const cacheFile = store ? join(folder,'weather-operational.json') : join(directory, 'weather.json');
  let locationKey = `${location.lat},${location.lon}`;
  const storedKey = (await read(credentialsFile))?.apiKey;
  let key = typeof storedKey === 'string' && /^[a-f0-9]{32}$/i.test(storedKey) ? storedKey : '';
  let cache = await read(cacheFile);
  if(store){
    const saved=await store.weatherState('openweather');
    cache={...(saved?.location===locationKey?saved:{}),...cache};
  }
  if (cache?.location !== locationKey || (cache.data && !Array.isArray(cache.data.minutely))) cache = null;
  const validGust = gust => number(gust?.mph, 0, 200 * 2.2369362921) && Number.isSafeInteger(gust.time) && gust.time > 0 && gust.time <= now() / 1000 + 300;
  const currentGust = data => ({mph:data?.current?.gustMph, time:data?.current?.time});
  // Migrate the previous cache using the observation time, never the fetch time.
  const storedGust = cache?.gust ?? currentGust(cache?.data);
  let gust = key && validGust(storedGust) ? storedGust : null;
  const currentEnabled=()=>enabled()&&weatherFields.some(field=>mappings()[field]!=='disabled');
  const signature=()=>JSON.stringify([enabled(),forecastEnabled(),mappings()]);
  let busy = false, configuring = false, removing=false, suspended=false, generation = 0, controller=null, collectionSignature=signature();
  let nextAttemptAt = number(cache?.nextAttemptAt,0,now()+WEATHER_INTERVAL) ? cache.nextAttemptAt : 0;
  let nextSetupAt = number(cache?.nextSetupAt,0,now()+SETUP_COOLDOWN) ? cache.nextSetupAt : 0;
  let failures = Number.isInteger(cache?.failures) ? Math.max(0, Math.min(2, cache.failures)) : 0;
  let error = failures && typeof cache?.error === 'string' ? cache.error : null;
  let forecastError = typeof cache?.forecastError === 'string' ? cache.forecastError : null;
  let forecastFetchedAt = cache?.forecastFetchedAt ?? cache?.fetchedAt ?? null;
  let writes=Promise.resolve();
  function scrub(){
    if(cache?.data)cache.data={...cache.data,current:filterCurrent(cache.data.current,mappings())};
    // Retention belongs only to the OWM-selected gust, never an HA fallback.
    if(mappings().gust&&mappings().gust!=='owm')gust=null;
  }
  function persist() {
    scrub();
    const operational={location:locationKey,failures,error,forecastError,nextAttemptAt,nextSetupAt};
    const current=structuredClone({data:cache?.data||null,fetchedAt:cache?.fetchedAt||null,forecastFetchedAt,gust});
    const context=locationKey;
    const write=writes.then(async()=>{
      await save(cacheFile,store?operational:{...operational,...current});
      // One bounded latest operational value, separate from immutable historical
      // forecasts. A later same-anchor response may update Live, never history.
      if(store)await store.saveWeatherState('openweather',{location:context,...current});
    });
    writes=write.catch(()=>{});return write;
  }
  await persist();
  async function fetchPart(path, normalize, coordinates, apiKey) {
    try {
      const url = new URL(`https://api.openweathermap.org/data/4.0/onecall/${path}`);
      url.search = new URLSearchParams({lat:String(coordinates.lat),lon:String(coordinates.lon),units:'metric',appid:apiKey});
      const response = await request(url, {signal:AbortSignal.any([AbortSignal.timeout(15000),controller.signal]),redirect:'error'});
      if (!response.ok) {
        await response.body?.cancel();
        const message = response.status === 401 || response.status === 403 ? 'OpenWeather rejected the key or One Call 4.0 access. Activate a One Call 4.0 subscription.' : response.status === 429 ? 'OpenWeather request limit reached.' : 'OpenWeather temporarily unavailable.';
        return {error:`HTTP ${response.status}: ${message}`, diagnostic: response.status === 401 || response.status === 403 ? 'weather-auth' : response.status === 429 ? 'weather-limit' : 'weather-error'};
      }
      // Never log provider bodies or URLs; both can contain credentials.
      let text = '';
      for await (const chunk of response.body) {
        text += Buffer.from(chunk).toString('utf8');
        if (Buffer.byteLength(text) > 262144) throw new Error('Response too large');
      }
      return {data:normalize(JSON.parse(text), now())};
    } catch {
      return {error:'Weather refresh failed; will retry automatically.'};
    }
  }
  let connectionStarted = false, connectionReady = false, lastFailed = false;
  async function refresh() {
    const fetchCurrent=currentEnabled(),fetchForecast=forecastEnabled();
    if ((!fetchCurrent&&!fetchForecast) || !key || busy || configuring || suspended || now() < nextAttemptAt) return;
    if (!connectionStarted) { onEvent('weather-start'); connectionStarted = true; }
    busy = true;
    controller=new AbortController();
    const epoch = generation;
    let diagnostic = 'weather-error', currentDiagnostic = 'weather-error';
    nextAttemptAt = now() + WEATHER_INTERVAL;
    try {
      await persist(); // Retain the request schedule across ordinary restarts.
      if(epoch!==generation)return;
      const [current, forecast] = await Promise.all([
        fetchCurrent?fetchPart('current', normalizeCurrent, location, key):{},
        fetchForecast?fetchPart('timeline/1min', normalizeMinutely, location, key):{},
      ]);
      if (epoch !== generation) return;
      if(current.data)current.data=filterCurrent(current.data,mappings());
      if(fetchCurrent)error = current.error || null;
      if(fetchForecast)forecastError = forecast.error || null;
      diagnostic = current.diagnostic || forecast.diagnostic || diagnostic;
      currentDiagnostic = current.diagnostic || currentDiagnostic;
      if(fetchCurrent)failures = error ? Math.min(2, failures + 1) : 0;
      if (current.data || forecast.data) {
        cache = {location:locationKey, data:{current:current.data ?? cache?.data?.current ?? null, minutely:forecast.data ?? cache?.data?.minutely ?? []}, fetchedAt:current.data ? now() : cache?.fetchedAt ?? null};
        if (forecast.data) forecastFetchedAt = now();
        const candidate = currentGust(cache.data);
        if (current.data && validGust(candidate) && (!gust || candidate.time > gust.time || (candidate.time === gust.time && candidate.mph !== gust.mph))) gust = {...candidate, fetchedAt:now()};
        scrub();
        if(store)try{await saveWeatherHistory(store,{context:locationKey,current:current.data,forecast:forecast.data,gust,receivedAt:now()});}catch{onEvent('storage-error');}
      }
    } catch {
      if (epoch === generation) {if(fetchCurrent){failures = Math.min(2, failures + 1);error='Weather refresh failed; will retry automatically.';}if(fetchForecast)forecastError='Weather refresh failed; will retry automatically.';}
    } finally {
      if (epoch === generation) {
        const samples = cache?.data?.minutely ?? [];
        const currentFailed=fetchCurrent&&!!error,forecastFailed=fetchForecast&&!!forecastError;
        const forecastGaps = fetchForecast&&!forecastError && (samples.length < 60 || samples.some((entry,i) => i > 0 && entry.time !== samples[i-1].time + 60));
        if (currentFailed) onEvent(currentDiagnostic);
        else if (forecastFailed && ['weather-auth','weather-limit'].includes(diagnostic)) onEvent(diagnostic);
        if (!forecastFailed && !forecastGaps && !currentFailed && lastFailed) onEvent('weather-recovered');
        else if (!currentFailed && !forecastFailed && !forecastGaps && !connectionReady) onEvent('weather-ready');
        lastFailed = currentFailed || forecastFailed;
        if (!lastFailed) connectionReady = true;
        // Preserve failed-poll state across restarts, as well as the request budget.
        try { await persist(); } catch { onEvent('storage-error'); }
      }
      busy = false;
      controller=null;
      if(epoch===generation)await onData();
    }
  }
  return {
    refresh,
    suspend(){suspended=true;generation++;controller?.abort();},
    async collectionChanged(){const next=signature();if(next!==collectionSignature){collectionSignature=next;generation++;controller?.abort();}await persist();suspended=false;void refresh();},
    async setLocation(value) {
      const nextKey = `${value.lat},${value.lon}`;
      if (nextKey === locationKey) return;
      generation++; location=value; locationKey=nextKey; cache=null; gust=null; error=null; forecastError=null; forecastFetchedAt=null; failures=0;
      // Retain the request budget; moving the map must not create unlimited API checks.
      await persist();
      void refresh();
    },
    configured: () => !!key&&!removing,
    async configure(value) {
      if (typeof value !== 'string' || (value !== '' && !/^[a-f0-9]{32}$/i.test(value))) return {status:400,error:'Enter a 32-character OpenWeather API key.'};
      if (configuring || busy&&value) return {status:409,error:'Weather update in progress. Please try again shortly.'};
      if (value && now() < nextSetupAt) {
        const retryAfter = Math.ceil((nextSetupAt - now()) / 1000);
        return {status:429,retryAfter,error:`Please wait ${retryAfter} seconds before checking a key again.`};
      }
      configuring = true;
      removing=!value;
      try {
        if(!key||!value)await onNewKey();
        await save(credentialsFile,{apiKey:value});
        onEvent('weather-key');
        generation++;controller?.abort();key=value; error=null; forecastError=null;
        if (!key) { cache=null; gust=null; failures=0; forecastFetchedAt=null; }
        // Explicit setup checks have a short, persistent cooldown; background polling keeps its normal interval.
        if (key) { nextAttemptAt = 0; nextSetupAt = now() + SETUP_COOLDOWN; }
        await persist();
        return {status:200,apiKeyConfigured:!!key,checking:!!key&&(currentEnabled()||forecastEnabled())};
      } finally { configuring=false;removing=false;void refresh(); }
    },
    status() {
      scrub();
      const data = key ? cache?.data : null;
      return {configured:!!key, enabled:currentEnabled(), forecastEnabled:forecastEnabled(), data:data || null, gust:key ? gust : null, fetchedAt:data ? cache.fetchedAt : null, forecastFetchedAt:key ? forecastFetchedAt : null, failures, error, forecastError, fetching:busy, nextAttemptAt:key&&(currentEnabled()||forecastEnabled()) ? nextAttemptAt : null};
    },
  };
}
