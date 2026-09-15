import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWeather,normalizeWeather,WEATHER_INTERVAL} from '../src/weather.js';
const time = 1789383600000;
const sample = () => ({current:{dt:time/1000,temp:14,feels_like:12,wind_speed:4},minutely:Array.from({length:61},(_,i)=>({dt:time/1000+i*60,precipitation:i/10}))});
const idle = async weather => { for(let i=0;i<100 && weather.status().fetching;i++) await new Promise(resolve=>setTimeout(resolve,5)); assert.equal(weather.status().fetching,false); };
async function fixture(t) {const dir=await mkdtemp(join(tmpdir(),'weather-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('changing centre discards old conditions and retains the request budget',async t=>{
  const dir=await fixture(t);let now=time;const coordinates=[];
  const weather=await createWeather(dir,{now:()=>now,request:async url=>{coordinates.push([url.searchParams.get('lat'),url.searchParams.get('lon')]);return Response.json(sample());}});
  await weather.configure('a'.repeat(32));await idle(weather);
  await weather.setLocation({lat:48.8566,lon:2.3522});
  assert.equal(weather.status().data,null);assert.equal(coordinates.length,1);
  now+=WEATHER_INTERVAL;await weather.refresh();
  assert.deepEqual(coordinates[1],['48.8566','2.3522']);assert.ok(weather.status().data);
});
test('weather normalization preserves timestamps, converts wind and does not fabricate missing minutely data', () => {
  const result=normalizeWeather(sample(),time);
  assert.equal(result.minutely.length,61);assert.equal(result.current.temperature,14);assert.ok(Math.abs(result.current.windMph-8.9477)<.001);
  const input=sample();delete input.minutely;assert.deepEqual(normalizeWeather(input,time).minutely,[]);
  input.current.temp='14';assert.throws(()=>normalizeWeather(input,time));
});
test('one shared request, secret isolation, persistent cache and schedule across restart', async t => {
  const dir=await fixture(t);let calls=0,now=time;
  const request=async (url,options)=>{calls++;assert.equal(url.hostname,'api.openweathermap.org');assert.equal(url.searchParams.get('exclude'),'hourly,daily,alerts');assert.equal(options.redirect,'error');return Response.json(sample());};
  const weather=await createWeather(dir,{now:()=>now,request});
  await weather.refresh();assert.equal(calls,0);
  assert.equal((await weather.configure('a'.repeat(32))).status,200);await idle(weather);
  assert.equal(calls,1);assert.equal(weather.status().data.current.temperature,14);
  assert.equal(JSON.stringify(weather.status()).includes('a'.repeat(32)),false);
  assert.equal((await readFile(join(dir,'weather.json'),'utf8')).includes('a'.repeat(32)),false);
  if(process.platform!=='win32') assert.equal((await stat(join(dir,'settings/openweather.json'))).mode&0o777,0o600);
  const restored=await createWeather(dir,{now:()=>now,request});await restored.refresh();assert.equal(calls,1);
  now+=WEATHER_INTERVAL;await restored.refresh();assert.equal(calls,2);
  await restored.configure('');assert.equal(restored.status().data,null);await restored.refresh();assert.equal(calls,2);
});
test('failed first fetch persists its retry budget and errors never expose provider text or key', async t => {
  const dir=await fixture(t);let calls=0;
  const request=async()=>{calls++;return new Response('sensitive provider echo '+ 'b'.repeat(32),{status:401});};
  const weather=await createWeather(dir,{now:()=>time,request});await weather.configure('b'.repeat(32));await idle(weather);
  assert.match(weather.status().error,/rejected/);assert.equal(JSON.stringify(weather.status()).includes('b'.repeat(32)),false);
  const restored=await createWeather(dir,{now:()=>time,request});await restored.refresh();assert.equal(calls,1);
});
test('provider failures preserve last good data and changed locations discard mismatched data', async t => {
  const dir=await fixture(t);let now=time,fail=false;
  const request=async()=> fail ? new Response('{}',{status:500}) : Response.json(sample());
  const weather=await createWeather(dir,{now:()=>now,request});await weather.configure('c'.repeat(32));await idle(weather);
  fail=true;now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().data.current.temperature,14);assert.ok(weather.status().error);
  const other=await createWeather(dir,{now:()=>now,request,location:{lat:0,lon:0}});assert.equal(other.status().data,null);
});

test('explicit setup checks bypass background wait with a persistent short cooldown', async t => {
  const dir=await fixture(t);let calls=0,now=time;
  const request=async()=>{calls++;return Response.json(sample());};
  const weather=await createWeather(dir,{now:()=>now,request});
  await weather.configure('a'.repeat(32));await idle(weather);assert.equal(calls,1);
  const blocked=await weather.configure('b'.repeat(32));assert.equal(blocked.status,429);assert.equal(blocked.retryAfter,30);
  const restored=await createWeather(dir,{now:()=>now,request});
  await restored.configure(''); // Disabling cannot bypass the setup cooldown on re-enable.
  assert.equal((await restored.configure('b'.repeat(32))).status,429);
  now+=30000;
  assert.equal((await restored.configure('b'.repeat(32))).checking,true);await idle(restored);assert.equal(calls,2);
  await restored.refresh();assert.equal(calls,2);
  now+=30000;
  await restored.configure('b'.repeat(32));await idle(restored);assert.equal(calls,3); // Recheck a now-activated key too.
  const restarted=await createWeather(dir,{now:()=>now,request});await restarted.refresh();assert.equal(calls,3);
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
  const request=async()=>{calls++;return fail?new Response('{}',{status:500}):Response.json(input);};
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
  assert.deepEqual(weather.status().gust,first);await weather.refresh();assert.equal(calls,3);
  fail=true;now+=WEATHER_INTERVAL;await weather.refresh();
  assert.deepEqual(weather.status().gust,first);assert.ok(weather.status().error);
  fail=false;input.current.dt=now/1000;input.current.wind_gust=0;
  now+=WEATHER_INTERVAL;await weather.refresh();
  assert.deepEqual(weather.status().gust,{mph:0,time:input.current.dt});
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
  const weather=await createWeather(dir,{now:()=>time,request:async()=>Response.json(input)});
  await weather.configure('a'.repeat(32));await idle(weather);
  const file=join(dir,'weather.json');const cache=JSON.parse(await readFile(file,'utf8'));delete cache.gust;
  await writeFile(file,JSON.stringify(cache));
  const restored=await createWeather(dir,{now:()=>time+120000});
  assert.equal(restored.status().gust.time,time/1000);
  assert.equal(restored.status().gust.mph,cache.data.current.gustMph);
});

test('one failed poll is retained, two failures survive restart, and successful recovery resets the count', async t=>{
  const dir=await fixture(t);let now=time,mode='ok',calls=0;
  const request=async()=>{
    calls++;
    if(mode==='http') return new Response('{}',{status:503});
    if(mode==='network') throw new Error('Network unavailable');
    if(mode==='invalid') return Response.json({current:{dt:now/1000,temp:14}});
    const input=sample();input.current.dt=now/1000;return Response.json(input);
  };
  let weather=await createWeather(dir,{now:()=>now,request});
  await weather.configure('a'.repeat(32));await idle(weather);assert.equal(weather.status().failures,0);
  mode='http';now+=WEATHER_INTERVAL;await weather.refresh();assert.equal(weather.status().failures,1);
  const savedTime=weather.status().data.current.time;
  await weather.refresh();assert.equal(weather.status().failures,1);assert.equal(calls,2);
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
