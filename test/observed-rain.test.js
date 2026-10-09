import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHistoryStore} from '../src/history-store.js';
import {createWeatherSettings} from '../src/weather-settings.js';
import {createHaWeather} from '../src/ha-weather.js';
import {loadWeatherHistory} from '../src/weather-history.js';
import {normalizeObservedRain,selectObservedRain} from '../public/weather-policy.js';

test('accumulated rain persists five-minute dry and wet observations, reset metadata, gaps and restart budget',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-observed-rain-'));
  let time=Math.floor(Date.now()/1000)*1000,calls=0,value='0',offline=false,reset=time,previous='0';
  const start=time,location={lat:1,lon:2},entity='sensor.demo_rain';
  const store=await createHistoryStore(dir,{now:time+86400000});await store.setRetention(180);
  let collector;
  t.after(async()=>{collector?.close();await store.close();await rm(dir,{recursive:true,force:true});});
  let settings=await createWeatherSettings(store,{now:()=>time});
  assert.equal(settings.current().rainAccumulation,'disabled');
  assert.equal((await settings.configure({rainAccumulation:entity})).status,400);
  assert.equal((await settings.configure({confirmUnits:true,haCollect:true,rainAccumulation:entity})).status,200);
  const ha={status:()=>({configured:true,revision:0}),json:async path=>{
    calls++;assert.equal(path,'/api/states/'+entity);if(offline)throw Error('offline');
    return {entity_id:entity,state:value,last_reported:new Date(time).toISOString(),attributes:{unit_of_measurement:'mm',state_class:'total_increasing',last_reset:new Date(reset).toISOString(),last_period:previous}};
  }};
  const weather={status:()=>({configured:true,data:{current:{time:time/1000,precipitation:99}},failures:0})};
  const make=()=>createHaWeather({ha,settings,weather,store,location:()=>location,now:()=>time,autoStart:false});
  collector=await make();await collector.collect();await collector.collect();assert.equal(calls,1);
  time+=300000;await collector.collect();assert.equal(calls,2); // Unchanged dry total still recorded.
  time+=300000;value='1.25';await collector.collect();
  time+=300000;value='0';previous='1.25';reset=time;await collector.collect();
  time+=300000;offline=true;await collector.collect();assert.equal(collector.status().observedRain.eligible,false);
  assert.equal(collector.status().observedRain.value,null); // Never substitute forecast rain.
  collector.close();settings=await createWeatherSettings(store,{now:()=>time});collector=await make();
  await collector.collect();assert.equal(calls,5);assert.equal(settings.current().rainAccumulation,entity);
  assert.equal((await store.status()).retentionDays,180);
  time+=300000;offline=false;value='0.5';await collector.collect();assert.equal(calls,6);
  const history=await loadWeatherHistory(store,location,time/1000,1);
  assert.equal(history.context,'1,2');
  const rain=history.presentations.map(row=>row.observedRain);
  assert.deepEqual(rain.map(row=>row.value),[0,0,1.25,0,null,0.5]);
  assert.equal(rain[1].time,start+300000);assert.equal(rain[1].receivedAt,start+300000);
  assert.equal(rain[3].resetAt,reset);assert.equal(rain[3].previousPeriod,1.25);
  assert.equal(rain[4].eligible,false);assert.equal(rain[5].eligible,true);
  await settings.configure({rainAccumulation:'sensor.other_rain'});await collector.changed();
  assert.equal(collector.status().observedRain.entity,'sensor.other_rain');
  assert.equal(collector.status().observedRain.eligible,false);assert.equal(calls,6);
  await settings.configure({haCollect:false});time+=300000;await collector.collect();assert.equal(calls,6);
});

test('observed rain preserves raw totals but rejects stale, malformed, incompatible and future samples',()=>{
  const time=Date.now(),entity='sensor.rain',policy={haCollect:true,rainAccumulation:entity};
  const state={state:'0',last_reported:new Date(time).toISOString(),attributes:{unit_of_measurement:'mm',state_class:'total_increasing'}};
  const read=(s=state,at=time)=>selectObservedRain(policy,{[entity]:normalizeObservedRain(s,time)},at);
  assert.equal(read().eligible,true);
  for(const stateClass of ['total','total_increasing'])for(const unit of ['mm','cm','in'])assert.equal(read({...state,attributes:{state_class:stateClass,unit_of_measurement:unit}}).eligible,true);
  for(const value of ['unknown','unavailable','','-1','NaN','Infinity'])assert.equal(read({...state,state:value}).eligible,false);
  assert.equal(read(state,time+600001).eligible,false);
  assert.equal(read({...state,last_reported:new Date(time+300001).toISOString()}).eligible,false);
  assert.equal(read({...state,last_reported:undefined}).eligible,false);
  assert.equal(read({...state,attributes:{unit_of_measurement:'mm/h',state_class:'measurement'}}).eligible,false);
  const wet=read({...state,state:'2.75'},time+600001);assert.equal(wet.value,2.75);assert.equal(wet.eligible,false);
});
