import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameLoader} from '../public/frame-loader.js';
const frames = (count, prefix='a') => Array.from({length:count},(_,i)=>({time:i*600,url:`/${prefix}${i}`,overviewUrl:`/${prefix}${i}-overview`}));
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('loader bounds concurrency, reuses paired images and leaves failed pairs absent',async()=>{
  let active=0,peak=0,calls=0;
  const loader=createFrameLoader({makeImage:()=>({src:'',async decode(){calls++;active++;peak=Math.max(peak,active);await turn();active--;if(this.src==='/a4-overview')throw Error('missing');}})});
  const offered=frames(37),first=await loader.load(offered);
  assert.equal(peak,2);assert.equal(first.length,36);assert.ok(!first.some(f=>f.time===2400));
  const prior=calls,next=await loader.load(offered,first);
  assert.equal(calls-prior,2);assert.equal(next[0],first[0]);
});

test('rapid changes replace queued work, cancel active work and load only the latest sequence',async()=>{
  let calls=0;const pending=[];
  const loader=createFrameLoader({makeImage:()=>({src:'',decode(){calls++;return new Promise(resolve=>pending.push(resolve));}})});
  const old=loader.load(frames(37));await turn();
  const middle=loader.load(frames(25,'b'));
  const latest=loader.load(frames(1,'c'));
  assert.equal(await middle,null);assert.equal(await old,null);
  await turn();
  while(pending.length) pending.shift()();await turn();
  while(pending.length) pending.shift()();
  const result=await latest;assert.equal(result[0].url,'/c0');assert.equal(calls,4);
});

test('generation changes discard decoded results and hung images time out',async()=>{
  let current=true,release;
  const loader=createFrameLoader({makeImage:()=>({src:'',decode:()=>new Promise(resolve=>release=resolve)}),timeoutMs:20});
  const work=loader.load(frames(1),[],()=>current);await turn();current=false;release();assert.equal(await work,null);
  current=true;assert.deepEqual(await loader.load(frames(1)),[]);
});
