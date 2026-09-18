import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameLoader} from '../public/frame-loader.js';
const frames = count => Array.from({length:count},(_,i)=>({time:i*600,url:`/m${i}`,overviewUrl:`/o${i}`}));
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('145-frame metadata is retained without eager image loading; decoding failures do not erase availability',async()=>{
  let calls=0;
  const loader=createFrameLoader({makeImage:()=>({src:'',async decode(){calls++;throw Error('client decode failure');}})});
  const offered=frames(145),result=await loader.load(offered);
  assert.equal(result.length,145);assert.equal(calls,0);
  assert.equal(await loader.prepare(result[4].overviewUrl),null);
  assert.equal(result[4].overviewUrl,'/o4');assert.equal(result[4].url,'/m4');
});

test('24-hour scrub retains a bounded LRU, two active decodes and reuses recent images',async()=>{
  let active=0,peak=0,calls=0;
  const loader=createFrameLoader({makeImage:()=>({src:'',async decode(){calls++;active++;peak=Math.max(active,peak);await turn();active--;}})});
  for(const f of await loader.load(frames(145)))await Promise.all([loader.prepare(f.url),loader.prepare(f.overviewUrl)]);
  assert.equal(peak,2);assert.equal(loader.metrics().cached,12);
  const before=calls;await loader.prepare('/m144');assert.equal(calls,before);
});

test('rapid scrubbing bounds queued work and cancellation resolves pending loads',async()=>{
  const loader=createFrameLoader({makeImage:()=>({src:'',decode:()=>new Promise(()=>{})})});
  const requests=Array.from({length:40},(_,i)=>loader.prepare(`/f${i}`));
  assert.equal(loader.metrics().active,2);assert.equal(loader.metrics().queued,8);
  loader.cancel();assert.ok((await Promise.all(requests)).every(r=>r===null));
  assert.deepEqual(loader.metrics(),{cached:0,active:0,queued:0});
});

test('obsolete sequences release cached references and hung images time out independently',async()=>{
  const loader=createFrameLoader({timeoutMs:10,makeImage:()=>({src:'',decode:()=>new Promise(()=>{})})});
  assert.equal(await loader.prepare('/hung'),null);
  assert.equal(await loader.load(frames(1),[],()=>false),null);
  assert.equal((await loader.load(frames(145))).length,145);
});
