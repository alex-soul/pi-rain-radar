import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {advanceGrassWetness} from '../src/grass-wetness.js';
import {grassDefaults} from '../public/grass-wetness-settings.js';
import {weatherReadings} from '../public/weather-readings.js';
import {createHistoryStore} from '../src/history-store.js';
import {createWeatherSettings} from '../src/weather-settings.js';
import {createHaWeather} from '../src/ha-weather.js';
import {loadWeatherHistory} from '../src/weather-history.js';
import {createWeatherReplay} from '../public/history-weather-model.js';
import {canonicalUnit,selectHaReadings} from '../public/weather-policy.js';

const start=1800000000000;
function snapshot(time,total=0,parameters={},values={}){
 const rows=Object.fromEntries(Object.entries({temperature:10,dew:8,wind:4,irradiance:0,...values}).map(([key,value])=>[key,{source:'ha',entity:'sensor.'+key,value,unit:key==='wind'?'mph':key==='irradiance'?'W/m²':'C',time,receivedAt:time}]));
 return {policy:{grassWetness:{...grassDefaults,enabled:true,...parameters}},rows,observedRain:{entity:'sensor.rain',eligible:true,value:total,unit:'mm',time,receivedAt:time,resetAt:start-3600000}};
}
test('reservoir warms up, counts rain only once, distinguishes dry/unknown and responds to tuning',()=>{
 let state,reading;
 for(let i=0;i<=6;i++){({state,reading}=advanceGrassWetness(state,snapshot(start+i*300000,i*.5),start+i*300000));if(i<6)assert.equal(reading.intensity,null);}
 assert.equal(reading.intensity,5);
 const repeated=advanceGrassWetness(state,snapshot(start+1800000,3),start+1800001);
 assert.equal(repeated.state.moisture,state.moisture);
 const tuned=advanceGrassWetness(state,snapshot(start+1800000,3,{sensitivity:.25}),start+1800001);
 assert.equal(tuned.reading.intensity,1);assert.equal(tuned.state.moisture,state.moisture);
 for(let i=7;i<=60;i++)({state,reading}=advanceGrassWetness(state,snapshot(start+i*300000,3,{}, {temperature:25,dew:5,irradiance:900,wind:15}),start+i*300000));
 assert.equal(reading.intensity,0);
 const missing=snapshot(start+61*300000,3);missing.rows.irradiance.source=null;
 assert.equal(advanceGrassWetness(state,missing,start+61*300000).reading.intensity,null);
 assert.equal(advanceGrassWetness(state,snapshot(start+61*300000,3,{enabled:false}),start+61*300000).reading.intensity,null);
});
test('reset metadata bridges counters; gaps, unexplained resets and source changes warm up again',()=>{
 let state;for(let i=0;i<=6;i++)({state}=advanceGrassWetness(state,snapshot(start+i*300000,2),start+i*300000));
 const at=start+2100000,s=snapshot(at,.1);s.observedRain.resetAt=at;s.observedRain.previousPeriod=2;
 const bridged=advanceGrassWetness(state,s,at);assert.equal(bridged.reading.eligible,true);
 delete s.observedRain.previousPeriod;assert.equal(advanceGrassWetness(state,s,at).reading.eligible,false);
 assert.equal(advanceGrassWetness(state,snapshot(at+3600000,3),at+3600000).reading.eligible,false);
 const changed=snapshot(at,2);changed.rows.wind.entity='sensor.other';assert.equal(advanceGrassWetness(state,changed,at).reading.eligible,false);
 const stale=snapshot(at,2);stale.rows.dew.time=at-600001;assert.equal(advanceGrassWetness(state,stale,at).reading.intensity,null);
});
test('every wetting and drying factor moves the reservoir in the documented direction',()=>{
 const values={temperature:10,dew:9,wind:10,irradiance:300};
 const initial=advanceGrassWetness(null,snapshot(start,0,{},values),start).state;
 const next=parameters=>advanceGrassWetness(initial,snapshot(start+300000,.2,parameters,values),start+300000).state.moisture;
 const baseline=next({});
 for(const key of ['rain','dew'])assert.ok(next({[key]:2})>baseline,key);
 for(const key of ['solar','wind','air','drainage'])assert.ok(next({[key]:2})<baseline,key);
 // Equivalent Fahrenheit / km/h inputs must give the same physical result.
 const other=snapshot(start+300000,.2,{},values);
 for(const key of ['temperature','dew']){other.rows[key].value=other.rows[key].value*1.8+32;other.rows[key].unit='F';}
 other.rows.wind.value*=1.609344;other.rows.wind.unit='km/h';
 const otherInitial=snapshot(start,0,{},values);
 for(const key of ['temperature','dew']){otherInitial.rows[key].value=otherInitial.rows[key].value*1.8+32;otherInitial.rows[key].unit='F';}
 otherInitial.rows.wind.value*=1.609344;otherInitial.rows.wind.unit='km/h';
 const equivalent=advanceGrassWetness(advanceGrassWetness(null,otherInitial,start).state,other,start+300000);
 assert.ok(Math.abs(equivalent.state.moisture-baseline)<1e-10);
});
test('irradiance has no OWM assignment/fallback and accepts zero with canonical W/m²',()=>{
 assert.equal(canonicalUnit('W/m2'),'W/m²');assert.equal(canonicalUnit('W/m²'),'W/m²');
 const policy={source:'ha',units:{},fallback:true,mappings:{irradiance:'sensor.solar'}},owm={configured:true,data:{current:{time:start/1000,irradiance:999}}};
 assert.equal(selectHaReadings(policy,{},owm,start).irradiance.source,null);
 const row={value:0,unit:'W/m²',time:start,receivedAt:start};
 assert.equal(selectHaReadings(policy,{'sensor.solar':row},owm,start).irradiance.value,0);
 assert.equal(selectHaReadings({...policy,mappings:{}},{},owm,start).irradiance.expected,'disabled');
 assert.equal(selectHaReadings(policy,{'sensor.solar':{...row,unit:'lux'}},owm,start).irradiance.source,null);
});
test('collector persists model and immutable replay, resumes after restart, validates settings and expires live output',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'grass-model-'));let time=Math.floor(Date.now()/1000)*1000,total=0;
 const store=await createHistoryStore(dir,{now:time+86400000});let collector;t.after(async()=>{collector?.close();await store.close();await rm(dir,{recursive:true,force:true});});
 const settings=await createWeatherSettings(store,{now:()=>time});
 assert.equal((await settings.configure({mappings:{irradiance:'owm'}})).status,400);
 assert.equal((await settings.configure({grassWetness:{sensitivity:99}})).status,400);
 const mappings=Object.fromEntries(['temperature','dew','wind','irradiance'].map(k=>[k,'sensor.'+k]));
 await settings.configure({confirmUnits:true,haCollect:true,mappings,rainAccumulation:'sensor.rain',grassWetness:{enabled:true}});
 const ha={status:()=>({configured:true,revision:1}),json:async path=>{const id=path.split('/').at(-1),key=id.split('.')[1];return {entity_id:id,state:String(key==='rain'?total:{temperature:10,dew:8,wind:4,irradiance:0}[key]),last_reported:new Date(time).toISOString(),attributes:{unit_of_measurement:key==='rain'?'mm':key==='wind'?'mph':key==='irradiance'?'W/m²':'C',state_class:key==='rain'?'total_increasing':undefined}};}};
 const weather={status:()=>({configured:false})},make=()=>createHaWeather({ha,settings,weather,store,location:()=>({lat:1,lon:2}),now:()=>time,autoStart:false});
 collector=await make();for(let i=0;i<=6;i++){await collector.collect();if(i<6){time+=300000;total+=.5;}}
 const before=structuredClone(collector.status().grassWetness);assert.equal(before.intensity,5,JSON.stringify(before));
 collector.close();collector=await make();assert.equal(collector.status().grassWetness.intensity,5);
 const state={presentation:collector.status()};assert.equal(weatherReadings(state,time).grassWetness.value,5);assert.equal(weatherReadings(state,time+600001).grassWetness.value,null);
 time+=1000;await settings.configure({grassWetness:{sensitivity:.25}});await collector.changed();
 assert.equal(collector.status().grassWetness.intensity,1);
 const history=await loadWeatherHistory(store,{lat:1,lon:2},Math.ceil(time/1000),2);
 const saved=history.presentations.find(row=>row.grassWetness?.intensity===5);assert.ok(saved);
 assert.deepEqual(saved.grassWetness,before);
 const replay=createWeatherReplay(history);assert.equal(weatherReadings(replay.weather(saved.time),saved.time*1000,{historical:true}).grassWetness.value,5);
 const restarted=await createWeatherSettings(store);assert.equal(restarted.current().grassWetness.sensitivity,.25);
});

test('Grass distinguishes missing setup from failed sensors, warm-up and valid nighttime zero',()=>{
 const policy={source:'ha',haCollect:true,owmCollect:false,units:{temperatureUnit:'C',windUnit:'mph'},mappings:{temperature:'sensor.temperature',dew:'sensor.dew',wind:'sensor.wind',irradiance:'sensor.irradiance'},grassWetness:{enabled:true},rainAccumulation:'sensor.rain'};
 const observations=Object.fromEntries(Object.entries(snapshot(start).rows).map(([key,row])=>['sensor.'+key,{...row}]));
 observations['sensor.rain']={value:0,unit:'mm',stateClass:'total_increasing',time:start,receivedAt:start,reportedAt:start};
 const state={configured:false,presentation:{policy,observations,grassWetness:{eligible:true,intensity:0,calculatedAt:start,reason:'Estimate'}}};
 const read=(value=state,time=start)=>weatherReadings(value,time).grassWetness;
 assert.equal(read().status,'ready');assert.equal(read().value,0);
 const missing=structuredClone(state);missing.presentation.policy.mappings.irradiance='disabled';missing.presentation.policy.rainAccumulation='disabled';
 assert.equal(read(missing).status,'setup');assert.equal(read(missing).value,null);
 assert.match(read(missing).reason,/Solar irradiance.*Observed rain/);
 delete missing.presentation.grassWetness;assert.equal(read(missing).status,'setup','setup is identified before any estimate exists');
 const failed=structuredClone(state);failed.presentation.observations['sensor.irradiance'].reason='HA reading unavailable';
 assert.equal(read(failed).status,'unavailable');assert.match(read(failed).reason,/Solar irradiance/);assert.equal(read(failed).value,null);
 assert.equal(read(state,start+600001).status,'unavailable');
 const mismatch=structuredClone(state);mismatch.presentation.observations['sensor.irradiance'].unit='lux';assert.equal(read(mismatch).status,'unavailable');
 const off=structuredClone(state);off.presentation.policy.haCollect=false;assert.equal(read(off).status,'setup');assert.match(read(off).reason,/collection is off/);
 off.presentation.policy.grassWetness.enabled=false;assert.equal(read(off).status,'disabled');
 const warming=structuredClone(state);warming.presentation.grassWetness={eligible:false,calculatedAt:start,reason:'Warming up · needs 30 minutes of continuous readings.'};assert.equal(read(warming).status,'warming');
 const before=JSON.stringify(state);assert.equal(weatherReadings(state,start,{historical:true}).grassWetness.status,'ready');assert.equal(JSON.stringify(state),before,'historical samples remain immutable');
});
