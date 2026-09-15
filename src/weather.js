import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { view } from './map.js';

export const WEATHER_INTERVAL = 600000;
export const SETUP_COOLDOWN = 30000;
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function normalizeWeather(raw, now = Date.now()) {
  const current = raw?.current;
  const validTime = time => Number.isSafeInteger(time) && time > now / 1000 - 7200 && time < now / 1000 + 7200;
  if (!current || !validTime(current.dt) || !number(current.temp, -100, 70) || !number(current.feels_like, -120, 90) || !number(current.wind_speed, 0, 200)) throw new Error('Invalid weather response');
  const minutely = [];
  const seen = new Set();
  if (Array.isArray(raw.minutely)) {
    for (const entry of raw.minutely.slice(0, 120)) {
      if (validTime(entry.dt) && number(entry.precipitation, 0, 1000) && !seen.has(entry.dt)) {
        minutely.push({ time: entry.dt, precipitation: entry.precipitation }); seen.add(entry.dt);
      }
    }
  }
  minutely.sort((a,b) => a.time-b.time);
  return { current: { time: current.dt, temperature: current.temp, feelsLike: current.feels_like, windMph: current.wind_speed * 2.2369362921, gustMph: number(current.wind_gust, 0, 200) ? current.wind_gust * 2.2369362921 : null }, minutely: minutely.slice(0, 61) };
}
async function read(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}
async function save(file, value) {
  const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temp, JSON.stringify(value), {mode:0o600});
  await rename(temp, file);
}
export async function createWeather(directory, { now = Date.now, request = fetch, location = view } = {}) {
  const folder = join(directory, 'settings');
  await mkdir(folder, {recursive:true,mode:0o700});
  const credentialsFile = join(folder, 'openweather.json');
  const cacheFile = join(directory, 'weather.json');
  let locationKey = `${location.lat},${location.lon}`;
  const storedKey = (await read(credentialsFile))?.apiKey;
  let key = typeof storedKey === 'string' && /^[a-f0-9]{32}$/i.test(storedKey) ? storedKey : '';
  let cache = await read(cacheFile);
  if (cache?.location !== locationKey || (cache.data && (!cache.data.current || !Array.isArray(cache.data.minutely)))) cache = null;
  const validGust = gust => number(gust?.mph, 0, 200 * 2.2369362921) && Number.isSafeInteger(gust.time) && gust.time > 0 && gust.time <= now() / 1000 + 300;
  const currentGust = data => ({mph:data?.current?.gustMph, time:data?.current?.time});
  // Migrate the previous cache using the observation time, never the fetch time.
  const storedGust = cache?.gust ?? currentGust(cache?.data);
  let gust = key && validGust(storedGust) ? storedGust : null;
  let busy = false, configuring = false, generation = 0;
  let nextAttemptAt = number(cache?.nextAttemptAt,0,now()+WEATHER_INTERVAL) ? cache.nextAttemptAt : 0;
  let nextSetupAt = number(cache?.nextSetupAt,0,now()+SETUP_COOLDOWN) ? cache.nextSetupAt : 0;
  let failures = Number.isInteger(cache?.failures) ? Math.max(0, Math.min(2, cache.failures)) : 0;
  let error = failures && typeof cache?.error === 'string' ? cache.error : null;
  async function persist() { await save(cacheFile, {location:locationKey, data:cache?.data || null, fetchedAt:cache?.fetchedAt || null, gust, failures, error, nextAttemptAt, nextSetupAt}); }
  async function refresh() {
    if (!key || busy || configuring || now() < nextAttemptAt) return;
    busy = true;
    const epoch = generation;
    let failed = false;
    nextAttemptAt = now() + WEATHER_INTERVAL;
    try {
      await persist(); // Retain the request schedule across ordinary restarts.
      const url = new URL('https://api.openweathermap.org/data/3.0/onecall');
      url.search = new URLSearchParams({lat:String(location.lat),lon:String(location.lon),units:'metric',exclude:'hourly,daily,alerts',appid:key});
      const response = await request(url, {signal:AbortSignal.timeout(15000),redirect:'error'});
      if (epoch !== generation) return;
      if (!response.ok) {
        failed = true;
        error = response.status === 401 || response.status === 403 ? 'OpenWeather rejected the key or One Call access.' : response.status === 429 ? 'OpenWeather request limit reached.' : 'OpenWeather temporarily unavailable.';
        error = `HTTP ${response.status}: ${error}`;
        return;
      }
      // Bound the external response before JSON decoding; never log raw provider errors/URLs.
      let text = '';
      for await (const chunk of response.body) {
        text += Buffer.from(chunk).toString('utf8');
        if (Buffer.byteLength(text) > 262144) throw new Error('Response too large');
      }
      const data = normalizeWeather(JSON.parse(text), now());
      if (epoch !== generation) return;
      const candidate = currentGust(data);
      if (validGust(candidate) && (!gust || candidate.time >= gust.time)) gust = candidate;
      cache = {location:locationKey, data, fetchedAt:now()};
      error = null; failures = 0;
    } catch {
      if (epoch === generation) { failed = true; error = 'Weather refresh failed; will retry automatically.'; }
    } finally {
      if (epoch === generation) {
        if (failed) failures = Math.min(2, failures + 1);
        // Preserve failed-poll state across restarts, as well as the request budget.
        try { await persist(); } catch { /* Keep the in-memory result if disk persistence fails. */ }
      }
      busy = false;
    }
  }
  return {
    refresh,
    async setLocation(value) {
      const nextKey = `${value.lat},${value.lon}`;
      if (nextKey === locationKey) return;
      generation++; location=value; locationKey=nextKey; cache=null; gust=null; error=null; failures=0;
      // Retain the request budget; moving the map must not create unlimited API checks.
      await persist();
      void refresh();
    },
    configured: () => !!key,
    async configure(value) {
      if (typeof value !== 'string' || (value !== '' && !/^[a-f0-9]{32}$/i.test(value))) return {status:400,error:'Enter a 32-character OpenWeather API key.'};
      if (configuring || busy) return {status:409,error:'Weather update in progress. Please try again shortly.'};
      if (value && now() < nextSetupAt) {
        const retryAfter = Math.ceil((nextSetupAt - now()) / 1000);
        return {status:429,retryAfter,error:`Please wait ${retryAfter} seconds before checking a key again.`};
      }
      configuring = true;
      try {
        await save(credentialsFile,{apiKey:value});
        generation++; key=value; error=null;
        if (!key) { cache=null; gust=null; failures=0; }
        // Explicit setup checks have a short, persistent cooldown; background polling keeps its normal interval.
        if (key) { nextAttemptAt = 0; nextSetupAt = now() + SETUP_COOLDOWN; }
        await persist();
        return {status:200,apiKeyConfigured:!!key,checking:!!key};
      } finally { configuring=false; void refresh(); }
    },
    status() {
      const data = key ? cache?.data : null;
      return {configured:!!key, data:data || null, gust:key ? gust : null, fetchedAt:data ? cache.fetchedAt : null, failures, error, fetching:busy, nextAttemptAt:key ? nextAttemptAt : null};
    },
  };
}
