import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHistoryStore} from '../src/history-store.js';
import {createWeatherSettings} from '../src/weather-settings.js';
import {createHaWeather} from '../src/ha-weather.js';
import {createWeatherReplay} from '../public/history-weather-model.js';
import {loadWeatherHistory,saveWeatherHistory} from '../src/weather-history.js';
import {createWeather} from '../src/weather.js';

test('HA collection is independent of primary source, keeps timestamps, persists failure decisions and respects policy changes',async t=>{
  let time=Math.floor(Date.now()/1000)*1000,calls=0,bad=false;const initial=time,dir=await mkdtemp(join(tmpdir(),'radar-ha-weather-'));
  const store=await createHistoryStore(dir,{now:initial+86400000});let collector;
  t.after(async()=>{collector?.close();await store.close();await rm(dir,{recursive:true,force:true});});
  const settings=await createWeatherSettings(store,{now:()=>time,owmEnabled:true});
  await settings.configure({confirmUnits:true,source:'openweather',haCollect:true,fallback:true,mappings:{temperature:'sensor.t'}});
  const weather={status:()=>({configured:true,failures:0,fetchedAt:initial,data:{current:{time:initial/1000,temperature:20,feelsLike:18,windMph:5,gustMph:7}}})};
  const ha={status:()=>({configured:true,revision:0}),json:async()=>{calls++;if(bad)throw Error('offline');return {entity_id:'sensor.t',state:'0',last_reported:new Date(time).toISOString(),attributes:{unit_of_measurement:'°C'}};}};
  const location={lat:1,lon:2};
  collector=await createHaWeather({ha,settings,weather,store,location:()=>location,now:()=>time,autoStart:false});
  await collector.collect();await collector.collect();assert.equal(calls,1);assert.equal(collector.status().rows.temperature.source,'openweather');
  time=initial+1000;await settings.configure({source:'ha'});await collector.changed();assert.equal(calls,1);assert.equal(collector.status().rows.temperature.source,'ha');
  const changeTime=time;
  time=initial+300000;bad=true;await collector.collect();assert.equal(calls,2);assert.equal(collector.status().rows.temperature.fallback,true);
  const failedTime=time;
  time+=1000;await settings.configure({units:{temperatureUnit:'F'}});await collector.changed();
  await saveWeatherHistory(store,{context:'1,2',current:weather.status().data.current,receivedAt:initial});
  const history=await loadWeatherHistory(store,location,Math.ceil(time/1000),2),replay=createWeatherReplay(history);
  assert.equal(replay.weather(changeTime/1000).presentation.rows.temperature.source,'ha');
  assert.equal(replay.weather(failedTime/1000).presentation.rows.temperature.fallback,true);
  assert.equal(replay.weather(failedTime/1000).units.temperatureUnit,'C');
  assert.equal(replay.weather(time/1000).units.temperatureUnit,'F');
  assert.equal(replay.weather(failedTime/1000,true).presentation,undefined);
  await settings.configure({haCollect:false});time+=300000;await collector.collect();assert.equal(calls,2);
});

test('OWM disabled collection suppresses both endpoints, retaining the request budget across toggles',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-owm-gate-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  let time=Date.now(),enabled=false,calls=0;
  const weather=await createWeather(dir,{now:()=>time,enabled:()=>enabled,request:async()=>{calls++;return new Response('{}',{status:503});}});
  await weather.configure('1'.repeat(32));await weather.refresh();assert.equal(calls,0);
  enabled=true;await weather.refresh();assert.equal(calls,2);
  enabled=false;weather.collectionChanged();enabled=true;weather.collectionChanged();await weather.refresh();assert.equal(calls,2);
  time+=600000;await weather.refresh();assert.equal(calls,4);assert.equal(weather.configured(),true);
});
