import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHistoryStore} from '../src/history-store.js';
import {grassLabRoutes} from '../src/grass-lab.js';
import {createSettingsAuth,setPin} from '../src/settings-auth.js';
import {grassLabFixture} from '../scripts/dev-grass-lab.mjs';
import {plotPoints} from '../public/grass-plot.js';
import {createWeatherSettings} from '../src/weather-settings.js';
import {grassDefaults} from '../public/grass-wetness-settings.js';

test('Grass observations persist, retries are idempotent and calibration retention is independent',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'grass-service-')),now=Date.now(),context='test-location';let store=await createHistoryStore(directory,{now});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const fixture=grassLabFixture(now),sample=fixture.samples[20];
 for(const days of [29,8,1]){const time=now-days*86400000;await store.put([{kind:'weather',source:'presentation',context,time,receivedAt:time,data:sample.snapshot}]);}
 const observation={id:'test-observation-1',observedAt:now-29*86400000,intensity:0,note:'dew'};
 const first=await store.grassObserve(context,observation);await store.grassObserve(context,observation);
 await assert.rejects(store.grassObserve(context,{...observation,intensity:3}));
 await store.setRetention(1);await store.maintain();
 assert.equal((await store.grassData(context)).presentations.length,3);
 await store.close();store=await createHistoryStore(directory,{now:now+32*86400000});
 const data=await store.grassData(context);assert.equal(data.presentations.length,1,'only initialization boundary remains after expiry');assert.deepEqual(data.observations,[first]);
 await store.grassImport(context,[observation],[]);assert.equal((await store.grassData(context)).observations.length,1);
});
test('production observation API enforces PIN, same origin, validation and retry IDs',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'grass-api-')),store=await createHistoryStore(directory),auth=createSettingsAuth(directory);
 await setPin(directory,'123456');
 const route=grassLabRoutes({store,auth,context:()=> 'test',version:'test'});
 const server=createServer((req,res)=>route(req,res,new URL(req.url,'http://localhost').pathname));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));await store.close();await rm(directory,{recursive:true,force:true});});
 const url=`http://127.0.0.1:${server.address().port}/api/grass-lab/observations`,body={id:'api-observation-1',intensity:3,observedAt:Date.now(),note:'Fog'};
 const post=(data=body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 assert.equal((await post()).status,401);
 const unlocked=await auth.unlock('123456'),headers={Authorization:'Bearer '+unlocked.token};
 assert.equal((await post(body,{...headers,Origin:'https://example.com'})).status,403);
 assert.equal((await post({...body,intensity:6},headers)).status,400);
 const response=await post(body,headers);assert.equal(response.status,201);
 assert.equal((await post(body,headers)).status,201);assert.equal((await store.grassData('test')).observations.length,1);
 const data=await (await fetch(url.replace('/observations','/data'))).json();assert.equal(data.observations.length,1);assert.equal(data.samples.length,0);
});
test('month chart reduction preserves extrema and true gaps',()=>{
 const points=Array.from({length:8641},(_,i)=>({time:i*300000,value:i===5555?5:i===6000?null:1}));
 const reduced=plotPoints(points,0,30*86400000,300);
 assert.ok(reduced.length<1500);assert.ok(reduced.some(p=>p.time===5555*300000&&p.value===5));assert.ok(reduced.some(p=>p.time===6001*300000&&p.breakBefore));
});

test('Lab parameter reset reads current settings independently of cached historical data',async t=>{
 let dew=1,reads=0;
 const route=grassLabRoutes({store:{grassData:async()=>{reads++;return {presentations:[],observations:[],markers:[],capturedAt:Date.now()};}},context:()=> 'test',version:'test',parameters:()=>({dew})});
 const server=createServer((req,res)=>route(req,res,new URL(req.url,'http://localhost').pathname));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api/grass-lab/`;
 await fetch(base+'data');
 const first=await fetch(base+'parameters');assert.equal(first.headers.get('cache-control'),'no-store');assert.equal((await first.json()).parameters.dew,1);
 dew=2.25;
 assert.equal((await(await fetch(base+'parameters')).json()).parameters.dew,2.25);
 assert.equal(reads,1,'Reset must not load weather history or use its last profile');
});

test('Apply authenticates, validates only sliders and persists through normal weather policy without enabling calculation',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'grass-apply-')),store=await createHistoryStore(directory),auth=createSettingsAuth(directory);
 await setPin(directory,'123456');
 const settings=await createWeatherSettings(store);
 await settings.configure({confirmUnits:true,units:{windUnit:'km/h'},grassWetness:{enabled:false,dew:2}});
 const before=settings.current();
 const route=grassLabRoutes({store,auth,context:()=> 'test',version:'test',parameters:()=>settings.current().grassWetness,saveParameters:input=>settings.configure({grassWetness:input})});
 const server=createServer((req,res)=>route(req,res,new URL(req.url,'http://localhost').pathname));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));await store.close();await rm(directory,{recursive:true,force:true});});
 const url=`http://127.0.0.1:${server.address().port}/api/grass-lab/parameters`;
 const {enabled,...values}=grassDefaults;values.dew=2.5;values.drainage=0;
 const post=(data=values,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 assert.equal((await post()).status,401);assert.deepEqual(settings.current(),before);
 const headers={Authorization:'Bearer '+(await auth.unlock('123456')).token};
 assert.equal((await post(values,{...headers,Origin:'https://example.com'})).status,403);
 for(const data of [{...values,enabled:true},{...values,dew:9},{...values,dew:'2'},null,{},[]])assert.equal((await post(data,headers)).status,400);
 const saved=await post(values,headers);assert.equal(saved.status,200);
 assert.deepEqual((await saved.json()).parameters,{enabled:false,...values});
 const after=settings.current();assert.deepEqual(after.units,before.units);assert.deepEqual(after.mappings,before.mappings);assert.equal(after.revision,before.revision+1);
 assert.deepEqual((await createWeatherSettings(store)).current().grassWetness,{enabled:false,...values});
 assert.equal((await(await fetch(url)).json()).parameters.dew,2.5);
});
