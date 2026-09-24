import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCameraCurrent} from '../src/camera-current.js';
import {createHistoryStore} from '../src/history-store.js';
import {cameraHistory,matchCamera} from '../src/camera.js';
import sharp from 'sharp';
const base=Math.floor(Date.now()/600000)*600000-3600000;
const source='11111111-1111-1111-1111-111111111111';
const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#abcdef'}}).jpeg().toBuffer();
const record=time=>({kind:'camera',source,context:source,time,receivedAt:time,basis:'acquisition',data:{name:'Camera'}});
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'camera-slot-')),store=await createHistoryStore(dir);t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});return {dir,store};}
test('ten captures retain one Archive representative, immediate Live, exact no-look-ahead and restart',async t=>{
 const {dir,store}=await fixture(t);let clock=base;let current=await createCameraCurrent(dir,store,()=>clock);
 // Pre-existing history is never compacted.
 await store.publish(record(base-300000),bytes);await store.publish(record(base-600000),bytes);
 for(let i=0;i<10;i++){clock=base+i*60000+557;await current.replace(record(clock),bytes);assert.equal(current.latest(source).time,clock);}
 assert.equal((await cameraHistory(store,clock,2)).records.length,2);
 await current.finalize();assert.equal((await cameraHistory(store,clock,2)).records.length,2);
 current=await createCameraCurrent(dir,store,()=>clock);assert.equal(current.latest(source).time,base+540557);
 clock=base+600000;await current.finalize();let history=await cameraHistory(store,clock,2);
 assert.equal(history.records.length,3);assert.equal(matchCamera(history.records,clock).time,base+540557);
 clock+=557;await current.replace(record(clock),bytes);history=await cameraHistory(store,clock,2);
 assert.equal(matchCamera(history.records,base+600000).time,base+540557);
 assert.equal(current.latest(source).time,clock);assert.deepEqual(current.image(source,String(clock)),bytes);
 assert.equal(current.image(source,String(clock-1)),null);
 clock=base+1200000;await current.finalize();await current.finalize();
 assert.equal((await cameraHistory(store,clock,2)).records.length,4);
});
test('failed Archive write keeps the candidate for retry; late metadata never overwrites a finalized pick',async t=>{
 const {dir,store}=await fixture(t);let clock=base+599000,fail=true;
 const proxy={...store,publish:async(...args)=>{if(fail)throw Error('disk unavailable');return store.publish(...args);}};
 let current=await createCameraCurrent(dir,proxy,()=>clock);await current.replace(record(clock),bytes);
 clock=base+600000;await assert.rejects(current.finalize());assert.equal(current.latest(source).time,base+599000);
 fail=false;current=await createCameraCurrent(dir,proxy,()=>clock);await current.finalize();
 await current.replace(record(base+599500),bytes);
 const history=await cameraHistory(store,clock,2);assert.equal(history.records.length,1);assert.equal(history.records[0].time,base+599000);
 assert.equal(current.latest(source).time,base+599500);
});
test('damaged optional current file is preserved and does not prevent startup',async t=>{
 const {dir,store}=await fixture(t);const file=join(dir,'camera-current.json');await writeFile(file,'invalid');
 const current=await createCameraCurrent(dir,store,()=>base);assert.equal(current.error,true);assert.equal(current.latest(source),null);assert.equal(await readFile(file,'utf8'),'invalid');
});
