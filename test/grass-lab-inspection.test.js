import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedSettingChanges,sampleAt,windowCursor} from '../scripts/dev-grass-lab-inspection.js';

test('settings markers follow recorded changes, including reversals, without inventing an initial event',()=>{
 const definitions=[{key:'dew',label:'Dew wetting',color:'green'},{key:'wind',label:'Wind drying',color:'purple'}];
 const row=(time,policy)=>({time,snapshot:{policy:{grassWetness:policy}}});
 const samples=[row(1,{dew:1,wind:1}),row(2,{dew:1,wind:1}),row(3,{dew:3,wind:1}),row(4,{dew:1,wind:2}),row(5,{dew:1,wind:2})];
 const markers=recordedSettingChanges(samples,definitions);
 assert.deepEqual(markers.map(m=>[m.time,m.changes.map(c=>[c.key,c.from,c.to,c.color])]),[
  [3,[['dew',1,3,'green']]],[4,[['dew',3,1,'green'],['wind',1,2,'purple']]]
 ]);
 assert.equal(recordedSettingChanges([row(1,undefined),row(2,{dew:3}),row(3,undefined),row(4,{dew:1})],definitions).length,0,'unknown configuration cannot establish a change');
 const copy=structuredClone(samples);recordedSettingChanges(samples,definitions);assert.deepEqual(samples,copy);
});
test('cursor inspection uses only preceding fresh data and clamps to the selected time window',()=>{
 const samples=[{time:1000000},{time:1300000},{time:2500000}];
 assert.equal(sampleAt(samples,999999),-1);
 assert.equal(sampleAt(samples,1299999),0,'never inspect a future sample');
 assert.equal(sampleAt(samples,1300000),1);
 assert.equal(sampleAt(samples,1900000),1);
 assert.equal(sampleAt(samples,1900001),-1,'do not bridge a historical gap');
 assert.equal(sampleAt([],0),-1);
 assert.equal(windowCursor(20,100,200),100);assert.equal(windowCursor(150,100,200),150);assert.equal(windowCursor(300,100,200),200);
});
