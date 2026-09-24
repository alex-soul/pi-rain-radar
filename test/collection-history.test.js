import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHistoryStore} from '../src/history-store.js';
import {collectionRecorder,collectionPeriods} from '../src/collection-history.js';
import {availabilityRows} from '../public/availability-model.js';

test('real collection transitions survive reopening and distinguish unknown, enabled gaps and off periods',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'radar-collection-'));let store;
 const start=Math.floor(Date.now()/600000)*600000;let clock=start;
 try{
  store=await createHistoryStore(dir,{now:start+86400000});
  const record=collectionRecorder(store,'cloud-collection',{now:()=>clock});
  await record({clouds:true,cloudMap:'main'});clock+=600000;
  await record({clouds:true,cloudMap:'both'});clock+=600000;
  await record({clouds:false,cloudMap:'both'});
  await store.close();store=await createHistoryStore(dir,{now:start+86400000});
  const periods=await collectionPeriods(store,clock/1000,2);
  assert.equal(periods.length,3);assert.equal(periods[1].cloudMap,'both');
  const rows=availabilityRows({frames:[],data:{collectionPeriods:periods},archive:true,start:start/1000-600,end:clock/1000});
  const clouds=rows.find(r=>r.label==='Clouds');
  assert.deepEqual(clouds.segments.map(s=>s.health),['unknown','error','error','disabled']);
  assert.deepEqual(clouds.segments[1].detail.map(d=>d.health),['error','disabled']);
  const recent=await collectionPeriods(store,clock/1000+7200,1);
  assert.equal(recent.at(-1).clouds,false); // boundary before requested window
 }finally{await store?.close();await rm(dir,{recursive:true,force:true});}
});

