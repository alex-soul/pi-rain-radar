import test from 'node:test';
import assert from 'node:assert/strict';
import {createHealthEvents} from '../src/health-events.js';
import {createDiagnostics} from '../src/diagnostics.js';
import {recordConnection,connectionEvents} from '../public/connection-events.js';

test('health log records independent red transitions and recovery without repeating polls or gaps',()=>{
  let now=1800000000000;
  const log=createDiagnostics({now:()=>now}),observe=createHealthEvents(log.record,()=>now);
  const sources={main:{time:now/1000,state:'ready'},overview:{time:now/1000,state:'ready'}};
  const weather={configured:true,fetchedAt:now,forecastFetchedAt:now,data:{current:{time:now/1000,temperature:14,feelsLike:12,windMph:9},minutely:[{time:now/1000,precipitation:0}]}};
  observe(sources,weather);assert.equal(log.snapshot().events.length,0,'partial forecast alone is quiet');
  observe(sources,{...weather,forecastError:'secret provider text'});
  observe(sources,{...weather,forecastError:'secret provider text'});
  assert.deepEqual(log.snapshot().events.map(e=>e.code),['forecast-unavailable']);
  observe(sources,weather);assert.equal(log.snapshot().events.at(-1).code,'forecast-available');
  log.record('weather-error');assert.equal(log.snapshot().events.at(-1).severity,'warning');
  observe(sources,{...weather,error:'failed',failures:1});
  assert.equal(log.snapshot().events.at(-1).code,'weather-error');
  observe(sources,{...weather,error:'failed',failures:2});
  assert.equal(log.snapshot().events.at(-1).code,'weather-unavailable');
  now+=1800000;observe(sources,weather);observe(sources,weather);
  assert.equal(log.snapshot().events.filter(e=>e.code==='main-unavailable').length,1);
  assert.equal(log.snapshot().events.filter(e=>e.code==='overview-unavailable').length,1);
  assert.ok(!JSON.stringify(log.snapshot()).includes('secret'));
});

test('browser connection events are transition-only, bounded and separate from appliance log',()=>{
  recordConnection(false,1000);recordConnection(false,2000);
  assert.equal(connectionEvents().length,1);
  recordConnection(true,3000);assert.equal(connectionEvents().at(-1).severity,'info');
  for(let i=0;i<60;i++)recordConnection(i%2===1,4000+i);
  assert.equal(connectionEvents().length,25);
  const copy=connectionEvents();copy[0].message='altered';assert.notEqual(connectionEvents()[0].message,'altered');
});

test('current weather and forecast expiry create independent log entries',()=>{
  const now=1800000000000;
  const sources={main:{time:now/1000,state:'ready'},overview:{time:now/1000,state:'ready'}};
  const healthy={configured:true,fetchedAt:now,forecastFetchedAt:now,data:{current:{time:now/1000,temperature:14,feelsLike:12,windMph:9},minutely:[{time:now/1000,precipitation:0}]}};
  for(const component of ['weather','forecast']) {
    const events=[],observe=createHealthEvents(code=>events.push(code),()=>now);
    const expired=structuredClone(healthy);
    if(component==='weather')expired.data.current.time-=1800;
    else expired.forecastFetchedAt-=1800000;
    observe(sources,healthy);observe(sources,expired);observe(sources,expired);
    assert.deepEqual(events,[`${component}-unavailable`]);
    observe(sources,healthy);
    assert.deepEqual(events,[`${component}-unavailable`,`${component}-available`]);
  }
});
