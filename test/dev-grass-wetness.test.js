import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDevWeather} from '../scripts/dev-weather.mjs';
import {weatherSeries,chartSegments} from '../public/weather-trends-model.js';
import {createWeatherReplay} from '../public/history-weather-model.js';
import {weatherReadings} from '../public/weather-readings.js';

test('grass scenario initialization is idempotent and retains chart history and tuning',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'grass-dev-')),dev=await createDevWeather(dir);
 t.after(async()=>{await dev.close();await rm(dir,{recursive:true,force:true});});
 await dev.scenario('grass-wet');await dev.configure('/initialize',{units:{}});
 const now=Date.now(),weather={configured:true,fetchedAt:now,data:{current:{time:Math.floor(now/1000)}}};
 const live=dev.status(weather,'grass-wet');assert.equal(live.weather.presentation.grassWetness.intensity,5);
 const before=dev.history();assert.equal(before.presentations.length,13);
 await dev.configure('/weather',{grassWetness:{sensitivity:.25}});
 await dev.configure('/initialize',{units:{}});
 assert.deepEqual(dev.history(),before);
 assert.equal((await dev.configure('/weather')).grassWetness.sensitivity,.25);
 const points=weatherSeries(before).grassWetness;
 assert.ok(chartSegments(points,now/1000-3600,now/1000+1,'').flat().some(p=>p.value===5));
 dev.status(weather,'grass-wet');assert.deepEqual(dev.history().presentations.slice(0,13),before.presentations);
});

test('visual grass history replays all six illustrative levels over 24 hours',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'grass-visual-')),end=Math.floor(Date.now()/600000)*600,dev=await createDevWeather(dir,end);
 t.after(async()=>{await dev.close();await rm(dir,{recursive:true,force:true});});
 await dev.scenario('grass-history');await dev.configure('/initialize',{units:{}});
 dev.status({configured:true,fetchedAt:Date.now(),data:{current:{time:end}}},'grass-history');
 const history=dev.history(),replay=createWeatherReplay(history);
 assert.equal(history.presentations.length,289);
 const scores=history.presentations.map(p=>weatherReadings(replay.weather(p.time),p.time*1000,{historical:true}).grassWetness.value);
 assert.deepEqual([...new Set(scores)].sort(),[0,1,2,3,4,5]);
 assert.equal(history.presentations.at(-1).time-history.presentations[0].time,86400);
 assert.match(history.presentations[0].grassWetness.reason,/not calculated/);
 const old=dev.history();dev.status({configured:true,data:{}},'grass-history');assert.deepEqual(dev.history(),old);
});
