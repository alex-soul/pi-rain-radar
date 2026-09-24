import test from 'node:test';
import assert from 'node:assert/strict';
import {availabilityRows} from '../public/availability-model.js';
import {syntheticAvailability} from '../scripts/dev-availability.mjs';
const start=Date.UTC(2026,8,22,10)/1000,end=start+7200;
function rows(scenario,archive=false){const d=syntheticAvailability({start,end,frames:[]},{scenario,archive});return availabilityRows({frames:d.frames,data:d,status:d,archive,start,end});}
test('short rain and cloud gaps borrow only in Live; Archive exposes exact gaps',()=>{
 for(const [label,index] of [['Rain',4],['Clouds',7]]){assert.equal(rows('availability-gaps').find(r=>r.label===label).segments[index].health,'warning');assert.equal(rows('availability-gaps',true).find(r=>r.label===label).segments[index].health,'error');}
});
test('healthy, prolonged gaps, disabled sources, failures and recovery are distinguishable',()=>{
 assert.ok(rows('availability-healthy').every(r=>r.segments.every(s=>s.health==='ready')));
 assert.ok(rows('availability-outage').every(r=>r.segments.some(s=>s.health==='error')));
 assert.deepEqual(rows('availability-disabled').map(r=>r.label),['Rain']);assert.equal(rows('availability-disabled',true).length,4);
 assert.equal(rows('availability-failed').length,4);assert.ok(rows('availability-failed').every(r=>r.segments.some(s=>s.health==='error')));
 assert.ok(rows('availability-recovered').every(r=>r.segments.every(s=>s.health==='ready')));
});

test('newest missing Live samples are Pending, older gaps and Archive remain errors',()=>{
 const data={collectionPeriods:[{time:start-600,camera:true,rain:true}]},status={camera:{enabled:true}};
 for(const archive of [false,true]){
  const result=availabilityRows({frames:[],data,status,archive,start,end});
  for(const row of result){assert.equal(row.segments.at(-1).health,archive?'error':'pending');assert.ok(row.segments.slice(0,-1).some(s=>s.health==='error'));}
 }
});
