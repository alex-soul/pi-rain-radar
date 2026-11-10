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

test('production observation edits and deletes are authenticated, location scoped and durable without changing weather',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'grass-edit-api-')),now=Date.now();let store=await createHistoryStore(directory,{now}),context='lawn';
 const auth=createSettingsAuth(directory);await setPin(directory,'123456');
 const route=grassLabRoutes({store:{grassData:(...a)=>store.grassData(...a),grassObserve:(...a)=>store.grassObserve(...a),grassEdit:(...a)=>store.grassEdit(...a),grassDelete:(...a)=>store.grassDelete(...a)},auth,context:()=>context,version:'test',now:()=>now});
 const server=createServer((req,res)=>route(req,res,new URL(req.url,'http://localhost').pathname));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));await store.close();await rm(directory,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`,path='/api/grass-lab/observations/edit-record-1';let token='';
 const send=(method,input={},origin=base)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',origin,Authorization:'Bearer '+token},body:JSON.stringify(input)});
 const read=async()=> (await fetch(base+'/api/grass-lab/data')).json();
 const sample=grassLabFixture(now).samples[30];await store.put([{kind:'weather',source:'presentation',context,time:sample.time,receivedAt:sample.time,data:sample.snapshot}]);
 await store.grassImport(context,[{id:'edit-record-1',observedAt:now-600000,intensity:3,note:'Original',source:{type:'spreadsheet'},reportedPi:0}],[]);
 await store.grassObserve(context,{id:'untouched-record',observedAt:now-500000,intensity:2,note:'Keep'});
 const original=await store.grassData(context),first=(await read()).observations[0],edit={observedAt:now-100000,intensity:0,note:' Changed '};
 assert.equal((await send('PATCH',edit)).status,401);assert.equal((await send('DELETE')).status,401);
 token=(await auth.unlock('123456')).token;
 for(const method of ['PATCH','DELETE'])for(const origin of ['https://example.com','not-a-url'])assert.equal((await send(method,edit,origin)).status,403);
 for(const input of [null,{},[],{...edit,observedAt:now+1},{...edit,intensity:6},{...edit,note:'x'.repeat(501)}])assert.equal((await send('PATCH',input)).status,400);
 assert.equal((await send('PATCH',{...edit,note:'x'.repeat(5000)})).status,413);
 context='another-lawn';assert.equal((await send('PATCH',edit)).status,404);assert.equal((await send('DELETE')).status,404);context='lawn';
 const response=await send('PATCH',edit);assert.equal(response.status,200);const saved=await response.json();
 assert.deepEqual(saved,{...first,...edit,note:'Changed'});assert.equal((await send('PATCH',edit)).status,200,'edit retry is safe');
 assert.equal((await read()).observations.find(o=>o.id===first.id).note,'Changed','edit invalidates cached data');
 await store.close();store=await createHistoryStore(directory,{now});
 const restarted=await store.grassData(context);assert.deepEqual(restarted.presentations,original.presentations);assert.deepEqual(restarted.observations.find(o=>o.id===first.id),saved);
 assert.equal((await send('DELETE')).status,200);assert.equal((await send('DELETE')).status,404);
 assert.equal((await read()).observations.length,1,'delete invalidates cached data');
 await store.close();store=await createHistoryStore(directory,{now});
 const final=await store.grassData(context);assert.deepEqual(final.presentations,original.presentations);assert.deepEqual(final.observations,original.observations.filter(o=>o.id!==first.id));
 await assert.rejects(store.grassObserve(context,{id:'future-observation',observedAt:now+1,intensity:1,note:''}));
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
