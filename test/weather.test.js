import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWeather,normalizeCurrent,normalizeMinutely,WEATHER_INTERVAL} from '../src/weather.js';
const normalizeWeather = (raw, now) => ({current:normalizeCurrent({data:[raw.current]},now),minutely:normalizeMinutely({data:raw.minutely ?? []},now)});
const response = (input, url) => Response.json({data:url.pathname.endsWith('/current') ? [input.current] : input.minutely});
const time = 1789383600000;
const sample = () => ({current:{dt:time/1000,temp:14,feels_like:12,wind_speed:4},minutely:Array.from({length:61},(_,i)=>({dt:time/1000+i*60,precipitation:i/10}))});
const idle = async weather => { for(let i=0;i<100 && weather.status().fetching;i++) await new Promise(resolve=>setTimeout(resolve,5)); assert.equal(weather.status().fetching,false); };
async function fixture(t) {const dir=await mkdtemp(join(tmpdir(),'weather-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('diagnostics distinguish provider access and rate limits, group repeatable events and report recovery safely',async t=>{
  const dir=await fixture(t);let now=time,status=401,calls=0;const events=[];
  const weather=await createWeather(dir,{now:()=>now,onEvent:code=>events.push(code),request:async url=>{
    calls++;
    if(status!==200) return new Response('secret provider body appid=private',{status});
    const input=sample();input.current.dt=now/1000;input.minutely=input.minutely.map(x=>({...x,dt:x.dt+(now-time)/1000}));
    return response(input,url);
  }});
  await weather.configure('a'.repeat(32));await idle(weather);
  assert.deepEqual(events,['weather-key','weather-start','weather-auth']);
  now+=WEATHER_INTERVAL;status=429;await weather.refresh();assert.equal(events.at(-1),'weather-limit');
  now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(events.at(-1),'weather-limit');
  now+=WEATHER_INTERVAL;status=200;await weather.refresh();assert.equal(events.at(-1),'weather-recovered');
  const count=events.length;now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(events.length,count);
  assert.equal(calls,10);assert.ok(!JSON.stringify(events).includes('private'));
});

test('4.0 normalization rejects old payloads and preserves zero, gaps and provider timestamps', () => {
  assert.throws(()=>normalizeCurrent(sample(),time));
  assert.throws(()=>normalizeMinutely(sample(),time));
  assert.throws(()=>normalizeCurrent({data:[]},time));
  const dt=time/1000;
  assert.deepEqual(normalizeMinutely({data:[null,{dt,precipitation:0},{dt,precipitation:9},{dt:dt+60},{dt:dt+120,precipitation:2},{dt:dt+180,precipitation:'3'}]},time),[{time:dt,precipitation:0},{time:dt+120,precipitation:2}]);
  assert.deepEqual(normalizeMinutely({data:[]},time),[]);
});

test('endpoint failures are independent and forecast timestamps survive restart', async t => {
  const dir=await fixture(t);let now=time,failedPart='',calls=0;
  const request=async url=>{
    calls++;
    if(url.pathname.endsWith(failedPart) && failedPart) return new Response('{}',{status:503});
    const input=sample();input.current.dt=now/1000;input.minutely=input.minutely.map(x=>({...x,dt:x.dt+(now-time)/1000}));
    return response(input,url);
  };
  let weather=await createWeather(dir,{now:()=>now,request});
  await weather.configure('a'.repeat(32));await idle(weather);
  failedPart='/timeline/1min';now+=WEATHER_INTERVAL;await weather.refresh();
  assert.equal(weather.status().failures,0);assert.equal(weather.status().error,null);
  assert.match(weather.status().forecastError,/503/);assert.equal(weather.status().fetchedAt,now);
  assert.equal(weather.status().forecastFetchedAt,time);
  weather=await createWeather(dir,{now:()=>now,request});await weather.refresh();assert.equal(calls,4);
  assert.equal(weather.status().forecastFetchedAt,time);assert.match(weather.status().forecastError,/503/);
  failedPart='/current';now+=WEATHER_INTERVAL;await weather.refresh();
  assert.equal(weather.status().failures,1);assert.equal(weather.status().forecastError,null);
  assert.equal(weather.status().forecastFetchedAt,now);assert.equal(weather.status().fetchedAt,time+WEATHER_INTERVAL);
  failedPart='';now+=WEATHER_INTERVAL;await weather.refresh();
  assert.equal(weather.status().error,null);assert.equal(weather.status().failures,0);
});

test('a first partial response is useful without the other endpoint and survives restart', async t => {
  for (const failedPart of ['/current','/timeline/1min']) {
    const dir=await fixture(t);
    const request=async url=>url.pathname.endsWith(failedPart)?new Response('{}',{status:401}):response(sample(),url);
    const weather=await createWeather(dir,{now:()=>time,request});
    await weather.configure('a'.repeat(32));await idle(weather);
    const state=weather.status();assert.ok(state.data);
    assert.equal(!!state.data.current,failedPart!=='/current');
    assert.equal(state.data.minutely.length,failedPart==='/current'?61:0);
    const restored=await createWeather(dir,{now:()=>time,request});assert.deepEqual(restored.status().data,state.data);
  }
});

test('upgrade retains the saved key, legacy normalized cache and next eligible request time', async t => {
  const dir=await fixture(t);let now=time,calls=0;
  const weather=await createWeather(dir,{now:()=>now,request:async url=>response(sample(),url)});
  await weather.configure('a'.repeat(32));await idle(weather);
  const file=join(dir,'weather.json');const old=JSON.parse(await readFile(file,'utf8'));
  delete old.forecastFetchedAt;delete old.forecastError;await writeFile(file,JSON.stringify(old));
  const restored=await createWeather(dir,{now:()=>now,request:async url=>{calls++;assert.equal(url.searchParams.get('appid'),'a'.repeat(32));return response(sample(),url);}});
  assert.equal(restored.configured(),true);assert.deepEqual(restored.status().data,old.data);
  assert.equal(restored.status().forecastFetchedAt,old.fetchedAt);
  await restored.refresh();assert.equal(calls,0);
  now+=WEATHER_INTERVAL;await restored.refresh();assert.equal(calls,2);
});

test('location changes discard both in-flight responses without clearing the request budget', async t => {
  const dir=await fixture(t);const releases=[];let calls=0;
  const request=url=>{calls++;return new Promise(resolve=>releases.push(()=>resolve(response(sample(),url))));};
  const weather=await createWeather(dir,{now:()=>time,request});await weather.configure('a'.repeat(32));
  while(releases.length<2) await new Promise(resolve=>setTimeout(resolve,5));
  await weather.setLocation({lat:1,lon:1});releases.forEach(release=>release());await idle(weather);
  assert.equal(weather.status().data,null);assert.equal(weather.status().gust,null);
  await weather.refresh();assert.equal(calls,2);
});

test('oversized and malformed provider responses produce safe errors without pagination requests', async t => {
  const dir=await fixture(t);let calls=0;
  const request=async url=>{calls++;return url.pathname.endsWith('/current') ? new Response('x'.repeat(262145)) : Response.json({data:[{dt:time/1000,precipitation:0}],next:'https://untrusted.invalid/?appid=secret'});};
  const weather=await createWeather(dir,{now:()=>time,request});await weather.configure('a'.repeat(32));await idle(weather);
  assert.equal(calls,2);assert.match(weather.status().error,/refresh failed/);
  assert.equal(weather.status().data.minutely.length,1);assert.equal(JSON.stringify(weather.status()).includes('secret'),false);
});

test('changing centre discards old conditions and retains the request budget',async t=>{
  const dir=await fixture(t);let now=time;const coordinates=[];
  const weather=await createWeather(dir,{now:()=>now,request:async url=>{coordinates.push([url.searchParams.get('lat'),url.searchParams.get('lon')]);return response(sample(),url);}});
  await weather.configure('a'.repeat(32));await idle(weather);
  await weather.setLocation({lat:48.8566,lon:2.3522});
  assert.equal(weather.status().data,null);assert.equal(coordinates.length,2);
  now+=WEATHER_INTERVAL;await weather.refresh();
  assert.deepEqual(coordinates[2],['48.8566','2.3522']);assert.ok(weather.status().data);
});
test('weather normalization preserves timestamps, converts wind and does not fabricate missing minutely data', () => {
  const result=normalizeWeather(sample(),time);
  assert.equal(result.minutely.length,61);assert.equal(result.current.temperature,14);assert.ok(Math.abs(result.current.windMph-8.9477)<.001);
  const input=sample();delete input.minutely;assert.deepEqual(normalizeWeather(input,time).minutely,[]);
  input.current.temp='14';assert.throws(()=>normalizeWeather(input,time));
});
test('two shared requests, secret isolation, persistent cache and schedule across restart', async t => {
  const dir=await fixture(t);let calls=0,now=time;
  const request=async (url,options)=>{calls++;assert.equal(url.hostname,'api.openweathermap.org');assert.equal(url.searchParams.get('units'),'metric');assert.ok(['/data/4.0/onecall/current','/data/4.0/onecall/timeline/1min'].includes(url.pathname));assert.equal(options.redirect,'error');return response(sample(),url);};
  const weather=await createWeather(dir,{now:()=>now,request});
  await weather.refresh();assert.equal(calls,0);
  assert.equal((await weather.configure('a'.repeat(32))).status,200);await idle(weather);
  assert.equal(calls,2);assert.equal(weather.status().data.current.temperature,14);
  assert.equal(JSON.stringify(weather.status()).includes('a'.repeat(32)),false);
  assert.equal((await readFile(join(dir,'weather.json'),'utf8')).includes('a'.repeat(32)),false);
  if(process.platform!=='win32') assert.equal((await stat(join(dir,'settings/openweather.json'))).mode&0o777,0o600);
  const restored=await createWeather(dir,{now:()=>now,request});await restored.refresh();assert.equal(calls,2);
  now+=WEATHER_INTERVAL;await restored.refresh();assert.equal(calls,4);
  await restored.configure('');assert.equal(restored.status().data,null);await restored.refresh();assert.equal(calls,4);
});
test('failed first fetch persists its retry budget and errors never expose provider text or key', async t => {
  const dir=await fixture(t);let calls=0;
  const request=async(url)=>{calls++;return new Response('sensitive provider echo '+ 'b'.repeat(32),{status:401});};
  const weather=await createWeather(dir,{now:()=>time,request});await weather.configure('b'.repeat(32));await idle(weather);
  assert.match(weather.status().error,/rejected/);assert.equal(JSON.stringify(weather.status()).includes('b'.repeat(32)),false);
  const restored=await createWeather(dir,{now:()=>time,request});await restored.refresh();assert.equal(calls,2);
});
test('provider failures preserve last good data and changed locations discard mismatched data', async t => {
  const dir=await fixture(t);let now=time,fail=false;
  const request=async(url)=> fail ? new Response('{}',{status:500}) : response(sample(),url);
  const weather=await createWeather(dir,{now:()=>now,request});await weather.configure('c'.repeat(32));await idle(weather);
  fail=true;now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().data.current.temperature,14);assert.ok(weather.status().error);
  const other=await createWeather(dir,{now:()=>now,request,location:{lat:0,lon:0}});assert.equal(other.status().data,null);
});

test('explicit setup checks bypass background wait with a persistent short cooldown', async t => {
  const dir=await fixture(t);let calls=0,now=time;
  const request=async(url)=>{calls++;return response(sample(),url);};
  const weather=await createWeather(dir,{now:()=>now,request});
  await weather.configure('a'.repeat(32));await idle(weather);assert.equal(calls,2);
  const blocked=await weather.configure('b'.repeat(32));assert.equal(blocked.status,429);assert.equal(blocked.retryAfter,30);
  const restored=await createWeather(dir,{now:()=>now,request});
  await restored.configure(''); // Disabling cannot bypass the setup cooldown on re-enable.
  assert.equal((await restored.configure('b'.repeat(32))).status,429);
  now+=30000;
  assert.equal((await restored.configure('b'.repeat(32))).checking,true);await idle(restored);assert.equal(calls,4);
  await restored.refresh();assert.equal(calls,4);
  now+=30000;
  await restored.configure('b'.repeat(32));await idle(restored);assert.equal(calls,6); // Recheck a now-activated key too.
  const restarted=await createWeather(dir,{now:()=>now,request});await restarted.refresh();assert.equal(calls,6);
});

test('optional gusts convert to mph without invalidating otherwise valid weather', () => {
  for (const value of [undefined, null, '12', -1, Infinity, 201]) {
    const input = sample(); input.current.wind_gust = value;
    assert.equal(normalizeWeather(input,time).current.gustMph,null);
  }
  const input = sample(); input.current.wind_gust = 10;
  assert.ok(Math.abs(normalizeWeather(input,time).current.gustMph - 22.36936) < .001);
  input.current.wind_gust = 0;
  assert.equal(normalizeWeather(input,time).current.gustMph,0);
});

test('gust cache survives missing samples, failed requests and restarts without renewing its observation time', async t => {
  const dir=await fixture(t);let now=time,fail=false,calls=0;
  let input=sample();input.current.wind_gust=10;
  const request=async(url)=>{calls++;return fail?new Response('{}',{status:500}):response(input,url);};
  let weather=await createWeather(dir,{now:()=>now,request});
  await weather.configure('a'.repeat(32));await idle(weather);
  const first=weather.status().gust;
  assert.equal(first.time,time/1000);assert.ok(first.mph>22);
  now+=WEATHER_INTERVAL;await weather.refresh(); // Same provider timestamp is not a newer gust.
  assert.deepEqual(weather.status().gust,first);
  input=sample();input.current.dt=now/1000;
  now+=WEATHER_INTERVAL;await weather.refresh();
  assert.equal(weather.status().data.current.gustMph,null);
  assert.deepEqual(weather.status().gust,first);
  weather=await createWeather(dir,{now:()=>now,request});
  assert.deepEqual(weather.status().gust,first);await weather.refresh();assert.equal(calls,6);
  fail=true;now+=WEATHER_INTERVAL;await weather.refresh();
  assert.deepEqual(weather.status().gust,first);assert.ok(weather.status().error);
  fail=false;input.current.dt=now/1000;input.current.wind_gust=0;
  now+=WEATHER_INTERVAL;await weather.refresh();
  assert.deepEqual(weather.status().gust,{mph:0,time:input.current.dt,fetchedAt:now});
  const newer=weather.status().gust;
  input.current.dt=time/1000;input.current.wind_gust=20;
  now+=WEATHER_INTERVAL;await weather.refresh();assert.deepEqual(weather.status().gust,newer);
  await weather.setLocation({lat:1,lon:1});assert.equal(weather.status().gust,null);
  const restored=await createWeather(dir,{now:()=>now,request,location:{lat:1,lon:1}});
  assert.equal(restored.status().gust,null);
  input.current.dt=now/1000;now+=WEATHER_INTERVAL;await restored.refresh();assert.ok(restored.status().gust);
  await restored.configure('');assert.equal(restored.status().gust,null);
  const disabled=await createWeather(dir,{now:()=>now,request,location:{lat:1,lon:1}});
  assert.equal(disabled.status().gust,null);
});

test('legacy gust cache is adopted with its original observation timestamp', async t=>{
  const dir=await fixture(t);let input=sample();input.current.wind_gust=8;
  const weather=await createWeather(dir,{now:()=>time,request:async url=>response(input,url)});
  await weather.configure('a'.repeat(32));await idle(weather);
  const file=join(dir,'weather.json');const cache=JSON.parse(await readFile(file,'utf8'));delete cache.gust;
  await writeFile(file,JSON.stringify(cache));
  const restored=await createWeather(dir,{now:()=>time+120000});
  assert.equal(restored.status().gust.time,time/1000);
  assert.equal(restored.status().gust.mph,cache.data.current.gustMph);
});

test('one failed poll is retained, two failures survive restart, and successful recovery resets the count', async t=>{
  const dir=await fixture(t);let now=time,mode='ok',calls=0;
  const request=async(url)=>{
    calls++;
    if(mode==='http') return new Response('{}',{status:503});
    if(mode==='network') throw new Error('Network unavailable');
    if(mode==='invalid') return Response.json({current:{dt:now/1000,temp:14}});
    const input=sample();input.current.dt=now/1000;return response(input,url);
  };
  let weather=await createWeather(dir,{now:()=>now,request});
  await weather.configure('a'.repeat(32));await idle(weather);assert.equal(weather.status().failures,0);
  mode='http';now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().failures,1);
  const savedTime=weather.status().data.current.time;
  await weather.refresh();assert.equal(weather.status().failures,1);assert.equal(calls,4);
  weather=await createWeather(dir,{now:()=>now,request});assert.equal(weather.status().failures,1);assert.match(weather.status().error,/503/);
  mode='network';now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().failures,2);
  assert.equal(weather.status().data.current.time,savedTime);
  weather=await createWeather(dir,{now:()=>now,request});assert.equal(weather.status().failures,2);
  mode='invalid';now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().failures,2);
  mode='ok';now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().failures,0);assert.equal(weather.status().error,null);
  mode='http';now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().failures,1);
  await weather.setLocation({lat:1,lon:1});assert.equal(weather.status().failures,0);assert.equal(weather.status().data,null);
  now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().failures,1);assert.equal(weather.status().data,null);
  await weather.configure('');assert.equal(weather.status().failures,0);
});
