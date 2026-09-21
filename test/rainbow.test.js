import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createRainbow } from '../src/rainbow.js';

const key = 'synthetic-rainbow-key-only';
const clock = Date.UTC(2026,8,17,12);
const png = await sharp({create:{width:256,height:256,channels:4,background:'#238abf'}}).png().toBuffer();
test('disabled collection permits explicit key validation but cancels queued background dispatch',async t=>{
  let enabled=false,disableOnWait=false;
  const f=await setup(t,{enabled:()=>enabled,sleep:async()=>{if(disableOnWait)enabled=false;}});
  assert.equal((await f.client.configure(key)).status,200);assert.equal(f.calls.length,2);
  await assert.rejects(f.client.getHistory(),/disabled/);assert.equal(f.calls.length,2);
  enabled=true;disableOnWait=true;await assert.rejects(f.client.getHistory(),/disabled/);assert.equal(f.calls.length,2);
});
async function setup(t, extra = {}) {
  const dir = await mkdtemp(join(tmpdir(),'rainbow-test-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const calls=[];
  const options={now:()=>clock,sleep:async()=>{},request:async(url,options)=>{calls.push({url,options}); return url.includes('/snapshot') ? Response.json({snapshot:clock/1000}) : new Response(png);},...extra};
  return {dir,calls,options,client:await createRainbow(dir,options)};
}
test('Rainbow validates key and tile before saving, with header authentication and safe status',async t=>{
  const f=await setup(t); const result=await f.client.configure(key);
  assert.equal(result.status,200);assert.equal(f.calls.length,2);assert.equal(result.usage.tiles,1);
  for(const call of f.calls){assert.equal(call.options.headers['Ocp-Apim-Subscription-Key'],key);assert.ok(!call.url.includes(key));assert.equal(call.options.redirect,'error');}
  assert.ok(f.calls[1].url.includes('/0/0/0/0?color=8&coverage=0'));
  assert.ok(!JSON.stringify(f.client.status()).includes(key));
  const resumed=await createRainbow(f.dir,f.options);assert.equal(resumed.configured(),true);
  const history=await resumed.getHistory();assert.equal(history.length,13);assert.equal(history.at(-1).time,clock/1000);assert.equal(history[0].time,clock/1000-7200);
});
test('hard test ceiling counts failures, persists on restart and serializes concurrent calls',async t=>{
  const f=await setup(t,{testRequestLimit:4});assert.equal((await f.client.configure(key)).status,200);
  const results=await Promise.allSettled(Array.from({length:6},()=>f.client.getHistory()));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(f.calls.length,4);
  const resumed=await createRainbow(f.dir,f.options);await assert.rejects(resumed.getHistory(),/allowance is exhausted/);assert.equal(f.calls.length,4);
});
test('failed replacement leaves old key intact and provider responses cannot leak into errors',async t=>{
  let fail=false;
  const f=await setup(t,{request:async url=>fail ? new Response('do not expose this secret',{status:401}) : url.includes('snapshot')?Response.json({snapshot:clock/1000}):new Response(png)});
  await f.client.configure(key);fail=true;const result=await f.client.configure('synthetic-replacement-key');
  assert.equal(result.status,400);assert.equal(result.configured,true);assert.ok(!JSON.stringify(result).includes('do not expose'));
  assert.equal(JSON.parse(await readFile(join(f.dir,'settings/rainbow.json'),'utf8')).apiKey,key);
  assert.equal(result.usage.total,3);
});
test('monthly cap counts snapshots and tiles, survives restart and resets at UTC month boundary',async t=>{
  let time=clock;
  const f=await setup(t,{monthlyLimit:()=>3,now:()=>time});await f.client.configure(key);
  await f.client.getHistory();
  const resumed=await createRainbow(f.dir,f.options);
  await assert.rejects(resumed.getHistory(),/Monthly API/);
  await assert.rejects(resumed.getTile({time:clock/1000},{zoom:0,x:0,y:0}),/Monthly API/);
  assert.equal(f.calls.length,3);assert.match(resumed.status().error,/Monthly API/);
  time=Date.UTC(2026,9,1);
  assert.equal(resumed.status().usage.requests,0);
  await resumed.getTile({time:clock/1000},{zoom:0,x:0,y:0});
  assert.equal(resumed.status().usage.requests,1);assert.equal(resumed.status().usage.tiles,1);assert.equal(resumed.status().usage.total,4);
});
test('legacy usage preserves all calls during migration, and failures count monthly',async t=>{
  const f=await setup(t);await f.client.configure(key);await f.client.getHistory();
  const file=join(f.dir,'settings/rainbow-usage.json');
  const saved=JSON.parse(await readFile(file,'utf8'));delete saved.requests;await writeFile(file,JSON.stringify(saved));
  const resumed=await createRainbow(f.dir,{...f.options,request:async()=>new Response('',{status:500})});
  assert.equal(resumed.status().usage.requests,3);
  await assert.rejects(resumed.getHistory());
  assert.equal(resumed.status().usage.requests,4);
});

test('429 backoff survives restart and malformed state fails closed',async t=>{
  const f=await setup(t,{request:async()=>new Response('',{status:429,headers:{'retry-after':'120'}})});
  assert.equal((await f.client.configure(key)).status,429);assert.equal(f.client.status().usage.total,1);
  const resumed=await createRainbow(f.dir,f.options);assert.equal((await resumed.configure(key)).status,429);assert.equal(resumed.status().usage.total,1);
  await writeFile(join(f.dir,'settings/rainbow-usage.json'),'{}');await assert.rejects(createRainbow(f.dir,f.options),/Stored Rainbow usage/);
});
test('invalid snapshots and corrupt PNGs do not replace the key, removal makes no requests',async t=>{
  for(const payload of [Response.json({snapshot:1}),Response.json({snapshot:'123'})]){
    const f=await setup(t,{request:async()=>payload});assert.equal((await f.client.configure(key)).status,503);assert.equal(f.client.configured(),false);
  }
  const f=await setup(t,{request:async url=>url.includes('snapshot')?Response.json({snapshot:clock/1000}):new Response('bad png')});
  assert.equal((await f.client.configure(key)).status,503);assert.equal(f.client.configured(),false);
  assert.equal((await f.client.configure('')).status,200);assert.equal(f.client.status().usage.total,2);
});
