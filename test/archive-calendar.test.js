import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDays,shiftMonth,monthRanges} from '../public/archive-calendar.js';
test('calendar handles leap years, Monday alignment and year boundaries',()=>{
 assert.equal(monthDays('2024-02').days.length,29);assert.equal(monthDays('2026-02').days.length,28);
 assert.equal(monthDays('2026-09').offset,1);assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2026-01',-1),'2025-12');
});
test('month reads cover extreme timezone boundaries while respecting bounded backend queries',()=>{
 for(const month of ['2026-01','2026-02','2024-02','2026-12']){
  const ranges=monthRanges(month),days=monthDays(month).days;
  assert.equal(ranges[0][1],ranges[1][0]);
  assert.ok(ranges[0][0]<=Date.parse(days[0]+'T00:00:00+14:00'));
  assert.ok(ranges[1][1]>=Date.parse(days.at(-1)+'T23:59:59-12:00'));
  for(const [start,end]of ranges)assert.ok(end>start&&end-start<=32*86400000);
 }
});

test('current-month requests never query future timestamps',()=>{
 const now=Date.parse('2026-09-03T00:00:00Z'),ranges=monthRanges('2026-09',now);
 assert.equal(ranges.length,1);assert.equal(ranges[0][1],now);
 assert.deepEqual(monthRanges('2026-10',now),[]);
});
