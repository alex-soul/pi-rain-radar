import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWeatherReplay,observedRainIntervals} from '../public/history-weather-model.js';
import {createHistoryStore} from '../src/history-store.js';
import {saveWeatherHistory,loadWeatherHistory} from '../src/weather-history.js';
const T=1800000000;
const sample=(offset,value,extra={},row={})=>({time:T+offset,location:'1,2',connectionRevision:1,observedRain:{source:'ha',entity:'sensor.rain',value,unit:'mm',eligible:true,stateClass:'total_increasing',basis:'ha-acquired-total',receivedAt:(T+offset)*1000,reportedAt:(T+offset)*1000,resetAt:null,previousPeriod:null,...extra},...row});
const derive=rows=>observedRainIntervals(rows,'1,2');
test('differences use real acquisition durations, convert mm/cm/in, preserve trustworthy zero and raw records',()=>{
 for(const [unit,factor]of [['mm',1],['cm',10],['in',25.4]]){
  const rows=[sample(0,1/factor,{unit}),sample(300,1.2/factor,{unit}),sample(750,1.2/factor,{unit})],before=JSON.stringify(rows),result=derive(rows);
  assert.ok(Math.abs(result[0].rate-2.4)<1e-9);assert.equal(result[1].rate,0);assert.equal(result[1].end-result[1].start,450);assert.equal(JSON.stringify(rows),before);
 }
});
test('invalid acquisitions, long gaps, source/unit/location/connection changes and delayed reports never become rain or zero',()=>{
 const cases=[sample(300,1.2,{eligible:false,reason:'Unavailable'}),sample(601,1.2),sample(300,1.2,{entity:'sensor.other'}),sample(300,.12,{unit:'cm'}),sample(300,1.2,{}, {location:'3,4'}),sample(300,1.2,{}, {connectionRevision:2}),sample(300,1.2,{reportedAt:(T-5)*1000}),sample(300,NaN),sample(300,1.2,{unit:'mm/h'}),sample(300,1.2,{reportedAt:(T+900)*1000}),sample(300,1.2,{reportedAt:(T+301)*1000})];
 for(const next of cases){const result=derive([sample(0,1),next]);assert.equal(result.length,1);assert.equal(result[0].rate,null);assert.ok(result[0].reason);}
 const result=derive([sample(0,0),sample(300,1,{eligible:false}),sample(600,2),sample(900,2.1)]);assert.deepEqual(result.map(p=>p.rate===null),[true,true,false]);
});
test('counter resets require bounded explicit previous-period evidence and never produce negative rain',()=>{
 assert.equal(derive([sample(0,2),sample(300,.1)])[0].rate,null);
 assert.equal(derive([sample(0,2),sample(300,3,{resetAt:(T+100)*1000})])[0].rate,null);
 const result=derive([sample(0,2),sample(300,.1,{resetAt:(T+100)*1000,previousPeriod:2.2})]);assert.ok(Math.abs(result[0].rate-3.6)<1e-9);
 assert.equal(derive([sample(0,2),sample(300,.1,{resetAt:(T-100)*1000,previousPeriod:2.2})])[0].rate,null);
 assert.equal(derive([sample(0,2),sample(300,.1,{resetAt:(T+100)*1000,previousPeriod:1})])[0].rate,null);
});
test('repeated presentation writes do not duplicate rain; conflicts and non-monotonic acquisitions break continuity',()=>{
 const a=sample(0,1),repeat={...a,time:T+60};assert.equal(derive([a,repeat,sample(300,1.2)]).length,1);
 assert.equal(derive([a,sample(0,2),sample(300,2.1)])[0].rate,null);
 const result=derive([sample(0,1),sample(300,1.2),sample(200,1.1,{}, {time:T+400}),sample(600,1.3)]);
 assert.equal(result.filter(p=>p.rate!==null).length,1);
});
test('partial boundary intervals and future horizons remain unknown; no forecast is used as an observation',()=>{
 const replay=createWeatherReplay({context:'1,2',rainObservations:[sample(0,1),sample(300,1.2),sample(600,1.4)]});
 assert.equal(replay.actualRain(T+60,T+600).seconds,300);
 assert.equal(replay.actualRain(T,T+900).seconds,600);
 assert.equal(replay.actualRain(T+600,T+3600).seconds,0);
 assert.equal(createWeatherReplay({forecasts:[{time:T,points:[{time:T,precipitation:2}]}]}).actualRain(T,T+3600).intervals.length,0);
});
test('archive loads retained observations beyond radar endpoint without adding future presentation or forecast revisions',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'rain-comparison-')),store=await createHistoryStore(dir,{now:(T+7200)*1000});t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
 await saveWeatherHistory(store,{context:'1,2',forecast:[{time:T,precipitation:0},{time:T+3600,precipitation:1}],receivedAt:T*1000});
 await saveWeatherHistory(store,{context:'1,2',forecast:[{time:T+600,precipitation:99}],receivedAt:(T+600)*1000});
 for(const offset of [0,300,600,3900]){const row=sample(offset,offset/1000);await store.put([{kind:'weather',source:'presentation',context:'1,2',time:row.time*1000,receivedAt:row.time*1000,data:row}]);}
 const history=await loadWeatherHistory(store,{lat:1,lon:2},T,1,{now:(T+7200)*1000});assert.equal(history.presentations.length,1);assert.equal(history.forecasts.length,1);assert.equal(history.rainObservations.length,3);assert.equal(history.end,T);const current=await loadWeatherHistory(store,{lat:1,lon:2},T,1,{now:T*1000});assert.equal(current.rainObservations.length,1,'future horizons do not query beyond acquisition time');assert.equal(createWeatherReplay(history).actualRain(T,T+3600).seconds,600);
});
