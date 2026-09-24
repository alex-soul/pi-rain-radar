import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createHistoryStore} from '../src/history-store.js';
import {playbackHistory} from '../src/playback-history.js';
import {cameraHistory} from '../src/camera.js';
import {cameraAt} from '../public/camera-model.js';
import {availabilityRows} from '../public/availability-model.js';

test('Live first-camera slot matches Archive despite wall-clock lag, without hiding genuine gaps',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'radar-window-history-'));
 const end=Math.floor(Date.now()/600000)*600,now=end*1000+400000;
 const store=await createHistoryStore(directory,{now});
 t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
 const bytes=await sharp({create:{width:8,height:8,channels:3,background:'#123456'}}).png().toBuffer();
 for(const hours of [2,4,6]){
  const start=end-hours*3600,prior=start*1000-299443;
  for(const time of [prior,start*1000+557])await store.publish({kind:'camera',source:'camera',context:'camera',time,receivedAt:time,basis:'acquisition',data:{}},bytes);
  await store.put([{kind:'transition',source:'camera-collection',context:'appliance',time:(start-600)*1000,receivedAt:now,data:{camera:true}}]);
  const wrong=await cameraHistory(store,now,hours);
  assert.equal(cameraAt(wrong.records,start*1000),null,'old wall-clock query reproduces false gap');
  const archive=await cameraHistory(store,end*1000,hours);
  for(const lag of [0,400000,599999,1800000]){
   const history=await playbackHistory(store,{lat:0,lon:0},{start,end},hours,end*1000+lag);
   assert.equal(cameraAt(history.cameraHistory.records,start*1000)?.time,prior);
   assert.deepEqual(history.cameraHistory,archive);
   const row=availabilityRows({data:history,status:{camera:{enabled:true}},start,end}).find(r=>r.label==='Camera');
   assert.equal(row.segments[0].health,'ready');
   assert.equal(row.segments[2].health,'error','expired predecessor remains a real gap');
   assert.equal(history.weatherHistory.end,end);
  }
 }
 const empty=await playbackHistory(store,{lat:0,lon:0},{},2,now);
 assert.equal(empty.weatherHistory.end,Math.floor(now/1000));
});
