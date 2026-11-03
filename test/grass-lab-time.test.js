import test from 'node:test';
import assert from 'node:assert/strict';
import {effectAt,calendarTicks} from '../scripts/dev-grass-lab-inspection.js';

test('contribution hover selects the containing acquisition interval without filling gaps',()=>{
 const steps=[{start:0,end:300},{start:300,end:600},{start:900,end:1200}];
 assert.equal(effectAt(steps,0),null);
 assert.equal(effectAt(steps,150),steps[0]);
 assert.equal(effectAt(steps,300),steps[0]);
 assert.equal(effectAt(steps,301),steps[1]);
 assert.equal(effectAt(steps,700),null);
 assert.equal(effectAt(steps,900),null);
 assert.equal(effectAt(steps,1200),steps[2]);
 assert.equal(effectAt(steps,1201),null);
 assert.equal(effectAt([],10),null);
});
test('calendar ticks use local round hours and midnight across DST and adapt to width',()=>{
 const start=Date.parse('2026-10-24T14:49:00Z'),end=Date.parse('2026-10-27T14:49:00Z');
 const ticks=calendarTicks(start,end,900,'Europe/London');
 assert.ok(ticks.some(t=>t.time===Date.parse('2026-10-24T23:00:00Z')&&t.midnight));
 assert.ok(ticks.some(t=>t.time===Date.parse('2026-10-26T00:00:00Z')&&t.midnight));
 assert.ok(ticks.every(t=>t.time>=start&&t.time<=end));
 assert.ok(ticks.filter(t=>t.major).length>calendarTicks(start,end,200,'Europe/London').filter(t=>t.major).length);
 const halfZone=calendarTicks(start,start+12*3600000,800,'Asia/Kolkata');
 assert.ok(halfZone.length>2);
 assert.ok(halfZone.every(t=>new Date(t.time).getUTCMinutes()===30));
 const month=calendarTicks(end-30*86400000,end,900,'Europe/London');
 assert.ok(month.filter(t=>t.major).length<=10);
 assert.ok(month.every(t=>t.midnight));
});
