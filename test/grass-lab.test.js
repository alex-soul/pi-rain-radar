import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {grassLabFixture,validateLabObservation,createGrassLab} from '../scripts/dev-grass-lab.mjs';
import {replayGrass,alignedGrass,observationComparison} from '../public/grass-replay.js';
import {integrationHealth} from '../public/integration-health.js';

test('replay reproduces baseline, responds across history and never mutates original inputs',()=>{
 const data=grassLabFixture(1793650000000),before=structuredClone(data);
 assert.deepEqual(replayGrass(data.samples),data.recorded);
 const alternative=replayGrass(data.samples,{...data.parameters,dew:3});
 assert.ok(alternative.some((p,i)=>p.value!==data.recorded[i].value));
 assert.deepEqual(data,before);
 assert.equal(alternative[0].value,null,'warmup is not a dry estimate');
 assert.equal(alignedGrass(alternative,data.start-1),null);
 assert.equal(alignedGrass(alternative,data.end+600001),null);
 const comparisons=observationComparison(alternative,data.observations);
 assert.ok(comparisons.count>0);assert.ok(Number.isFinite(comparisons.meanAbsoluteDifference));
 assert.throws(()=>replayGrass(data.samples,{...data.parameters,dew:10}));
});
test('observation input keeps event time, allows zero, rejects invalid grades and notes',()=>{
 const input={intensity:0,observedAt:1000,note:' fog '};
 const result=validateLabObservation(input,2000);assert.equal(result.observedAt,1000);assert.equal(result.loggedAt,2000);assert.equal(result.note,'fog');
 for(const extra of [{intensity:1.2},{intensity:6},{note:'x'.repeat(501)},{observedAt:500000}])assert.equal(validateLabObservation({...input,...extra},2000),null);
});
test('local lab persists concurrent observations and rejects cross-origin writes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'grass-lab-test-'));let handler=await createGrassLab(dir);
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const initial=await (await fetch(base+'/__grass-lab/data')).json();
 const post=(note,origin=base)=>fetch(base+'/__grass-lab/observations',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify({intensity:3,observedAt:Date.now(),note})});
 assert.equal((await post('blocked','https://example.com')).status,403);
 const responses=await Promise.all([post('one'),post('two')]);assert.ok(responses.every(r=>r.status===201));
 handler=await createGrassLab(dir);const stored=await (await fetch(base+'/__grass-lab/data')).json();
 assert.equal(stored.observations.length,initial.observations.length+2);
 assert.deepEqual(stored.recorded,initial.recorded);
});
test('aviation status distinguishes partial, disabled and expired reports',()=>{
 const now=1793650000000,state={enabled:true,station:'TEST',products:{metar:{state:'ready',lastSuccess:now},taf:{state:'missing'}},reports:{metar:{observedAt:now,acquiredAt:now}}};
 assert.equal(integrationHealth({aviation:state},now).aviation.label,'Partially usable');
 assert.equal(integrationHealth({aviation:{...state,enabled:false}},now).aviation.label,'Disabled');
 assert.equal(integrationHealth({aviation:state},now+91*60000).aviation.label,'Unavailable');
});
