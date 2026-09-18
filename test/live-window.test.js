import test from 'node:test';
import assert from 'node:assert/strict';
import { liveDueThrough, ageLiveCoverage } from '../public/live-window.js';

test('offline Live ages an early partial slot even when its endpoint does not move',()=>{
  const end=18000,coverage=[{time:end,main:true,overview:false,pending:true}];
  assert.equal(liveDueThrough(end+599),end-600);
  assert.equal(ageLiveCoverage(coverage,end,end,liveDueThrough(end+599)).complete,true);
  const aged=ageLiveCoverage(coverage,end,end,liveDueThrough(end+600));
  assert.equal(aged.complete,false);assert.equal(aged.counts.overview.missing,1);
  const outage=ageLiveCoverage(coverage,end+600,end+1200,liveDueThrough(end+1800));
  assert.equal(outage.counts.main.missing,2);assert.equal(outage.counts.overview.missing,2);
  assert.equal(outage.complete,false);
});
