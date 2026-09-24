import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWeather,WEATHER_INTERVAL} from '../src/weather.js';
import {createWeatherSettings} from '../src/weather-settings.js';
import {createHaWeather} from '../src/ha-weather.js';
import {createHomeAssistant} from '../src/home-assistant.js';
import {weatherFields,defaultUnits} from '../public/weather-policy.js';

const start=1789383600000;
const disabled=Object.fromEntries(weatherFields.map(field=>[field,'disabled']));
const response=(url,time)=>Response.json({data:url.pathname.endsWith('/current')?
  [{dt:time/1000,temp:14,feels_like:12,wind_speed:4,wind_gust:8,humidity:60,dew_point:8,wind_deg:180,visibility:10000,pressure:1012,uvi:2}]:
  Array.from({length:61},(_,i)=>({dt:time/1000+i*60,precipitation:0}))});
const idle=async weather=>{for(let i=0;i<200&&weather.status().fetching;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(weather.status().fetching,false);};
function memoryStore(){
  const states={},records=[];
  return {states,records,weatherState:async key=>structuredClone(states[key]),
    saveWeatherState:async(key,value)=>{states[key]=structuredClone(value);},
    saveWeatherPolicy:async value=>{states.policy=structuredClone(value);records.push({kind:'policy',data:structuredClone(value)});},
    put:async rows=>{records.push(...structuredClone(rows));}};
}
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'radar-policy-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=memoryStore();let time=start,weather,collector;const calls=[];
  const settingsFile=join(dir,'settings','weather-policy.json');
  const settings=await createWeatherSettings(store,{settingsFile,now:()=>time,beforeChange:()=>{weather?.suspend();collector?.suspend();},onChange:async()=>{await weather?.collectionChanged();await collector?.changed();}});
  // These collection lifecycle cases start with explicitly selected OWM readings.
  await settings.configure({mappings:Object.fromEntries(weatherFields.map(field=>[field,'owm']))});
  const options={store,now:()=>time,enabled:()=>settings.current().owmCollect,forecastEnabled:()=>settings.current().forecastCollect,mappings:()=>settings.current().mappings,
    onNewKey:async()=>{assert.equal((await settings.configure({owmCollect:false,forecastCollect:false,fallback:false})).status,200);},
    request:async url=>{calls.push(url.pathname);return response(url,time);}};
  weather=await createWeather(dir,options);
  return {dir,store,settings,settingsFile,calls,options,get weather(){return weather;},setWeather:value=>{weather=value;},setCollector:value=>{collector=value;},tick:()=>{time+=WEATHER_INTERVAL;},time:()=>time};
}

for(const current of [false,true])for(const forecast of [false,true])test(`independent gates: current ${current}, forecast ${forecast}`,async t=>{
  const f=await fixture(t);await f.weather.configure('a'.repeat(32));assert.equal(f.calls.length,0);
  await f.settings.configure({owmCollect:current,forecastCollect:forecast});await idle(f.weather);await f.weather.refresh();
  assert.equal(f.calls.filter(path=>path.endsWith('/current')).length,Number(current));
  assert.equal(f.calls.filter(path=>path.endsWith('/1min')).length,Number(forecast));
  const reopened=await createWeather(f.dir,f.options);f.setWeather(reopened);await reopened.refresh();assert.equal(f.calls.length,Number(current)+Number(forecast));
});

test('all Disabled suppresses current only; toggles and restart retain the request budget',async t=>{
  const f=await fixture(t);await f.weather.configure('a'.repeat(32));
  await f.settings.configure({mappings:disabled,owmCollect:true,forecastCollect:true});await idle(f.weather);
  assert.deepEqual(f.calls,['/data/4.0/onecall/timeline/1min']);
  await f.settings.configure({mappings:{temperature:'owm'}});await f.weather.refresh();assert.equal(f.calls.length,1);
  f.tick();await f.weather.refresh();assert.equal(f.calls.length,3);
  assert.deepEqual(Object.keys(f.weather.status().data.current),['time','temperature']);
  await f.settings.configure({mappings:{temperature:'disabled'},forecastCollect:false});
  f.tick();await f.weather.refresh();assert.equal(f.calls.length,3);
  const reopened=await createWeather(f.dir,f.options);f.setWeather(reopened);await reopened.refresh();assert.equal(f.calls.length,3);
});

test('disabled values and retained gust are removed from new caches/presentations without rewriting archive',async t=>{
  const f=await fixture(t);await f.weather.configure('a'.repeat(32));await f.settings.configure({owmCollect:true});await idle(f.weather);
  const oldRecords=structuredClone(f.store.records);assert.ok(f.weather.status().gust);
  await f.settings.configure({confirmUnits:true,source:'ha',haCollect:true,mappings:{gust:'disabled',humidity:'disabled',temperature:'sensor.indoor'}});
  assert.equal(f.weather.status().gust,null);assert.equal(f.weather.status().data.current.gustMph,undefined);
  assert.equal(f.store.states.openweather.data.current.humidity,undefined);
  // OWM comparison data remains for an enabled HA override, independently of visibility.
  assert.equal(f.store.states.openweather.data.current.temperature,14);
  assert.deepEqual(f.store.records.slice(0,oldRecords.length),oldRecords);
  const ha={status:()=>({configured:true,revision:0}),json:async()=>{throw Error('unused');}};
  const collector=await createHaWeather({ha,settings:f.settings,weather:f.weather,store:f.store,location:()=>({lat:1,lon:2}),autoStart:false,now:f.time});t.after(()=>collector.close());
  await collector.record();const presentation=f.store.records.at(-1).data;
  assert.equal(presentation.owm.data.current.gustMph,undefined);assert.equal(presentation.owm.gust,null);
  assert.equal(presentation.rows.gust.expected,'disabled');assert.equal(presentation.rows.gust.value,null);
  f.tick();await f.weather.refresh();
  const latest=f.store.records.filter(r=>r.source==='openweather'&&r.kind==='weather').at(-1);
  assert.equal(latest.data.current.humidity,undefined);assert.equal(latest.data.current.gustMph,undefined);assert.equal(latest.data.current.temperature,14);
});

test('disabling the last metric discards a late response, including after off/on, without resetting budget',async t=>{
  const f=await fixture(t);let release,started;const pending=new Promise(resolve=>{started=resolve;});
  const weather=await createWeather(f.dir,{...f.options,request:async url=>{f.calls.push(url.pathname);started();await new Promise(resolve=>{release=resolve;});return response(url,f.time());}});f.setWeather(weather);
  await weather.configure('a'.repeat(32));await f.settings.configure({owmCollect:true,mappings:{...disabled,temperature:'owm'}});await pending;
  await f.settings.configure({mappings:{temperature:'disabled'}});await f.settings.configure({mappings:{temperature:'owm'}});
  release();await idle(weather);assert.equal(weather.status().data,null);
  await weather.refresh();assert.equal(f.calls.length,1);assert.equal(f.store.records.some(r=>r.source==='openweather'),false);
});

test('removal disables current, Forecast and fallback; re-add stays off, replacement preserves policy',async t=>{
  const f=await fixture(t);await f.weather.configure('a'.repeat(32));await f.settings.configure({owmCollect:true,forecastCollect:true,fallback:true});await idle(f.weather);
  f.tick();await f.weather.configure('b'.repeat(32));await idle(f.weather);assert.equal(f.settings.current().owmCollect,true);assert.equal(f.settings.current().forecastCollect,true);assert.equal(f.settings.current().fallback,true);
  const beforeRemoval=f.settings.current().mappings;
  await f.weather.configure('');assert.deepEqual(f.settings.current().mappings,beforeRemoval);assert.equal(f.settings.current().owmCollect,false);assert.equal(f.settings.current().forecastCollect,false);assert.equal(f.settings.current().fallback,false);
  f.tick();await f.weather.configure('c'.repeat(32));await idle(f.weather);const count=f.calls.length;await f.weather.refresh();assert.equal(f.calls.length,count);
  const restored=await createWeatherSettings(f.store,{settingsFile:f.settingsFile});assert.equal(restored.current().owmCollect,false);assert.equal(restored.current().forecastCollect,false);
  assert.equal(JSON.parse(await readFile(join(f.dir,'settings','openweather.json'),'utf8')).apiKey,'c'.repeat(32));
});

test('OWM credential removal while a response is pending never republishes old data',async t=>{
  const f=await fixture(t);let release,started;const pending=new Promise(resolve=>{started=resolve;});
  const weather=await createWeather(f.dir,{...f.options,request:async url=>{started();await new Promise(resolve=>{release=resolve;});return response(url,f.time());}});f.setWeather(weather);
  await weather.configure('a'.repeat(32));await f.settings.configure({owmCollect:true});await pending;
  assert.equal((await weather.configure('')).status,200);release();await idle(weather);
  assert.equal(weather.status().data,null);assert.equal(f.store.states.openweather.data,null);assert.equal(f.settings.current().owmCollect,false);
});

test('policy transition invalidates responses before its durable commit finishes',async t=>{
  const f=await fixture(t);let releaseResponse,responseStarted;
  const started=new Promise(resolve=>{responseStarted=resolve;});
  const weather=await createWeather(f.dir,{...f.options,request:async url=>{responseStarted();await new Promise(resolve=>{releaseResponse=resolve;});return response(url,f.time());}});f.setWeather(weather);
  await weather.configure('a'.repeat(32));await f.settings.configure({owmCollect:true});await started;
  const save=f.store.saveWeatherPolicy;let releaseCommit,commitStarted;
  const committing=new Promise(resolve=>{commitStarted=resolve;});
  f.store.saveWeatherPolicy=async value=>{commitStarted();await new Promise(resolve=>{releaseCommit=resolve;});await save(value);};
  const change=f.settings.configure({mappings:disabled});await committing;
  releaseResponse();await idle(weather);assert.equal(weather.status().data,null);
  releaseCommit();assert.equal((await change).status,200);
  assert.equal(f.store.records.some(r=>r.source==='openweather'),false);
});

test('a failed policy commit prevents credential removal and restores durable intent',async t=>{
  const f=await fixture(t);await f.weather.configure('a'.repeat(32));await f.settings.configure({owmCollect:true});await idle(f.weather);
  const before=f.settings.current();f.store.saveWeatherPolicy=async()=>{throw Error('simulated storage failure');};
  await assert.rejects(f.weather.configure(''),/simulated storage failure/);
  assert.equal(f.weather.configured(),true);assert.deepEqual(f.settings.current(),before);
  assert.deepEqual(JSON.parse(await readFile(f.settingsFile,'utf8')),before);
});

test('HA-selected gust keeps raw OWM comparison but never adopts retained gust',async t=>{
  const f=await fixture(t);await f.weather.configure('a'.repeat(32));
  await f.settings.configure({confirmUnits:true,haCollect:true,source:'ha',owmCollect:true,fallback:true,mappings:{gust:'sensor.gust'}});await idle(f.weather);
  assert.ok(f.weather.status().data.current.gustMph>0);assert.equal(f.weather.status().gust,null);
  const ha={status:()=>({configured:true,revision:0}),json:async()=>{throw Error('unavailable');}};
  const collector=await createHaWeather({ha,settings:f.settings,weather:f.weather,store:f.store,location:()=>({lat:1,lon:2}),autoStart:false,now:f.time});t.after(()=>collector.close());
  await collector.collect();assert.equal(collector.status().rows.gust.fallback,true);assert.equal(collector.status().owm.gust,null);
});

test('legacy policy migration preserves units, source, off switches and history; fresh policy is off',async()=>{
  for(const enabled of [false,true]){
    const store=memoryStore();const legacy={version:1,revision:7,effectiveAt:start-1000,initialized:true,source:'ha',fallback:true,mappings:{temperature:'sensor.room',feels:'owm',wind:'owm',gust:'owm'},units:{...defaultUnits,temperatureUnit:'F'},baseline:{...defaultUnits},owmCollect:enabled,haCollect:true};
    await store.saveWeatherPolicy(legacy);const settings=await createWeatherSettings(store,{now:()=>start});
    assert.equal(settings.current().forecastCollect,enabled);assert.equal(settings.current().owmCollect,enabled);assert.equal(settings.current().mappings.temperature,'sensor.room');assert.equal(settings.current().units.temperatureUnit,'F');
    assert.equal(Object.keys(settings.current().mappings).length,10);assert.deepEqual(store.records[0].data,legacy);
    const count=store.records.length;await createWeatherSettings(store);assert.equal(store.records.length,count);
  }
  const fresh=await createWeatherSettings(memoryStore());assert.equal(fresh.current().owmCollect,false);assert.equal(fresh.current().forecastCollect,false);assert.equal(fresh.current().haCollect,false);
});

test('HA polls only assigned sensors, deduplicates them, drops disabled observations and rejects late responses',async t=>{
  const f=await fixture(t);let calls=0,release,started;let wait=false;
  const ha={status:()=>({configured:true,revision:0}),json:async path=>{calls++;if(wait){started();await new Promise(resolve=>{release=resolve;});}return {entity_id:path.split('/').at(-1),state:'20',last_reported:new Date(f.time()).toISOString(),attributes:{unit_of_measurement:'°C'}};}};
  const collector=await createHaWeather({ha,settings:f.settings,weather:f.weather,store:f.store,location:()=>({lat:1,lon:2}),autoStart:false,now:f.time});t.after(()=>collector.close());
  await f.settings.configure({confirmUnits:true,haCollect:true,mappings:disabled});await collector.collect();assert.equal(calls,0);
  await f.settings.configure({mappings:{temperature:'sensor.room',feels:'sensor.room'}});await collector.collect();assert.equal(calls,1);
  assert.equal(Object.keys(collector.status().observations).length,1);
  await f.settings.configure({mappings:{temperature:'disabled',feels:'disabled'}});await collector.changed();assert.deepEqual(f.store.states.ha.observations,{});
  f.tick();wait=true;const pending=new Promise(resolve=>{started=resolve;});await f.settings.configure({mappings:{temperature:'sensor.room'}});const collecting=collector.collect();await pending;
  await f.settings.configure({mappings:{temperature:'disabled'}});await collector.changed();await f.settings.configure({mappings:{temperature:'sensor.room'}});
  release();await collecting;assert.deepEqual(collector.status().observations,{});
  await collector.collect();assert.equal(calls,2);
});

test('HA off resets only HA mappings; credential re-add is off and successful replacement keeps configuration',async t=>{
  const f=await fixture(t);const ha=await createHomeAssistant(f.dir,{autoStart:false,now:f.time,get:async()=>Buffer.from('{"message":"ok"}'),beforeChange:async()=>{assert.equal((await f.settings.configure({haCollect:false})).status,200);}});t.after(()=>ha.close());
  await ha.configure({url:'http://ha.test:8123',token:'first'});await f.settings.configure({confirmUnits:true,haCollect:true,source:'ha',mappings:{temperature:'sensor.room',gust:'disabled'}});
  await ha.configure({url:'http://ha.test:8123',token:'replacement'});assert.equal(f.settings.current().haCollect,true);assert.equal(f.settings.current().mappings.temperature,'sensor.room');
  await ha.configure({remove:true});assert.equal(f.settings.current().haCollect,false);assert.equal(f.settings.current().mappings.temperature,'owm');assert.equal(f.settings.current().mappings.gust,'disabled');
  await ha.configure({url:'http://ha.test:8123',token:'readded'});assert.equal(f.settings.current().haCollect,false);
  const restored=await createWeatherSettings(f.store,{settingsFile:f.settingsFile});assert.equal(restored.current().haCollect,false);assert.equal(restored.current().mappings.gust,'disabled');
});


test('six added HA assignments persist and HA-off resets them while preserving Disabled',async t=>{
 const f=await fixture(t),extra=['humidity','dew','direction','visibility','pressure','uv'];
 const mappings=Object.fromEntries(extra.map(field=>[field,'sensor.'+field]));
 assert.equal((await f.settings.configure({confirmUnits:true,haCollect:true,mappings})).status,200);
 const reopened=await createWeatherSettings(f.store,{settingsFile:f.settingsFile,now:f.time});
 for(const field of extra)assert.equal(reopened.current().mappings[field],'sensor.'+field);
 await reopened.configure({mappings:{uv:'disabled'}});await reopened.configure({haCollect:false});
 for(const field of extra.filter(x=>x!=='uv'))assert.equal(reopened.current().mappings[field],'owm');
 assert.equal(reopened.current().mappings.uv,'disabled');
});
