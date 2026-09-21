import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWeather} from '../src/weather.js';
import {createHistoryStore} from '../src/history-store.js';
import {saveWeatherHistory,loadWeatherHistory} from '../src/weather-history.js';
import {createWeatherReplay} from '../public/history-weather-model.js';
const T=Date.UTC(2026,8,20,12)/1000;
const snapshot=(time,points)=>({time,receivedAt:(T+3600)*1000,points:points.map(([time,precipitation])=>({time,precipitation}))});

test('comparison matching is backward-only, inclusive at ten minutes, and uses exact point times',()=>{
  for(const drift of [0,600,601]){
    const replay=createWeatherReplay({forecasts:[snapshot(T-3600-drift,[[T,7]])]});
    assert.equal(replay.comparison(T,60).at(-1).predicted,drift<=600?7:null);
  }
  const future=createWeatherReplay({forecasts:[snapshot(T-3599,[[T,8]])]});
  assert.equal(future.comparison(T,60).at(-1).predicted,null);
  const missing=createWeatherReplay({forecasts:[snapshot(T-3600,[[T,7]]),snapshot(T-3300,[[T-60,3]])]});
  assert.equal(missing.comparison(T,50).at(-1).predicted,null,'do not splice an older revision to fill the chosen snapshot');
});

test('saved forward forecast retains its original anchor and points, including late receipts',()=>{
  const replay=createWeatherReplay({forecasts:[snapshot(T,[[T,0],[T+120,3],[T+3600,1]]),snapshot(T+600,[[T+600,9]])]});
  const selected=replay.forecast(T+300);assert.equal(selected.time,T);assert.equal(selected.pointMap.has(T+60),false);
  assert.equal(replay.forecast(T-1),null);assert.equal(replay.forecast(T+601),null,'an expired newest snapshot cannot fall back to another snapshot');
  assert.equal(selected.receivedAt,(T+3600)*1000);
});

test('NOW values stay fixed across leads and two-hour comparisons use thirteen timestamp samples',()=>{
  const forecasts=Array.from({length:21},(_,i)=>snapshot(T-(20-i)*600,Array.from({length:61},(_,m)=>[T-(20-i)*600+m*60,i+m/100])));
  const replay=createWeatherReplay({forecasts});const a=replay.comparison(T,10),b=replay.comparison(T,60);
  assert.equal(a.length,13);assert.equal(a[0].time,T-7200);assert.deepEqual(a.map(p=>p.now),b.map(p=>p.now));assert.notDeepEqual(a.map(p=>p.predicted),b.map(p=>p.predicted));
});

test('historical readings hold preceding observations without interpolation or future borrowing',()=>{
  const replay=createWeatherReplay({weather:[{time:T,current:{time:T,temperature:5},receivedAt:T*1000},{time:T+600,current:{time:T+600,temperature:15},receivedAt:(T+600)*1000}]});
  assert.equal(replay.weather(T-1).data.current,null);assert.equal(replay.weather(T+599).data.current.temperature,5);assert.equal(replay.weather(T+600).data.current.temperature,15);
});

test('SQLite keeps first successful forecast across concurrent revisions, restart and location isolation',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'forecast-history-'));let store=await createHistoryStore(dir,{now:T*1000});
  t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  const save=(rain,context='1,2')=>saveWeatherHistory(store,{context,forecast:[{time:T-600,precipitation:rain},{time:T,precipitation:rain}],receivedAt:T*1000});
  await Promise.all([save(2),save(9)]);await save(4,'3,4');
  await store.close();store=await createHistoryStore(dir,{now:T*1000});await save(12);
  const history=await loadWeatherHistory(store,{lat:1,lon:2},T,24);assert.equal(history.forecasts.length,1);assert.equal(history.forecasts[0].points[0].precipitation,2);
  assert.equal((await loadWeatherHistory(store,{lat:3,lon:4},T,24)).forecasts[0].points[0].precipitation,4);
});

test('bounded load includes the earliest comparison tolerance and honors the shared cutoff',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'forecast-boundary-')),store=await createHistoryStore(dir,{now:T*1000});
  t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  const earliest=T-86400-11400;
  for(const time of [earliest-1,earliest,T-86400,T])await saveWeatherHistory(store,{context:'1,2',forecast:[{time,precipitation:0}],receivedAt:T*1000});
  let history=await loadWeatherHistory(store,{lat:1,lon:2},T,24);assert.equal(history.start,earliest);assert.deepEqual(history.forecasts.map(s=>s.time),[earliest,T-86400,T]);
  await store.setRetention(1);history=await loadWeatherHistory(store,{lat:1,lon:2},T,24);assert.deepEqual(history.forecasts.map(s=>s.time),[T-86400,T]);
});

test('scheduled collection stores observation/anchor times without extra calls and keeps Live revisions across restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'weather-collector-'));let store=await createHistoryStore(dir,{now:(T+3600)*1000}),clock=T*1000,calls=0,rain=2;
 t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
 await mkdir(join(dir,'settings'),{recursive:true});await writeFile(join(dir,'settings','openweather.json'),JSON.stringify({apiKey:'a'.repeat(32)}));
 const options={store,now:()=>clock,location:{lat:1,lon:2},request:async url=>{calls++;return Response.json({data:url.pathname.endsWith('/current')?[{dt:clock/1000-300,temp:14,feels_like:12,wind_speed:4}]:Array.from({length:61},(_,i)=>({dt:T-60+i*60,precipitation:rain}))});}};
 const weather=await createWeather(dir,options);await weather.refresh();clock+=600000;rain=9;await weather.refresh();
 const history=await loadWeatherHistory(store,{lat:1,lon:2},clock/1000,24);
 assert.equal(calls,4);assert.equal(history.weather[0].time,T-300);assert.equal(history.forecasts[0].time,T-60);assert.equal(history.forecasts.length,1);assert.equal(history.forecasts[0].points[0].precipitation,2);
 assert.equal(weather.status().data.minutely[0].precipitation,9);
 await store.close();store=await createHistoryStore(dir,{now:(T+3600)*1000});
 const restored=await createWeather(dir,{...options,store});assert.equal(restored.status().data.minutely[0].precipitation,9);assert.equal(calls,4);
});
