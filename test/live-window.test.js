import test from 'node:test';
import assert from 'node:assert/strict';
import {liveDueThrough,ageLiveCoverage} from '../public/live-window.js';
test('five-minute lag advances exactly at the deadline; newest missing slot ages into a real gap',()=>{
 const end=18000,coverage=[{time:end,main:true,overview:false}];
 assert.equal(liveDueThrough(end+299.999),end-600);
 assert.equal(liveDueThrough(end+300),end);
 assert.equal(liveDueThrough(end+899.999),end);
 assert.equal(liveDueThrough(end+900),end+600);
 const grace=ageLiveCoverage(coverage,end,end,end);
 assert.equal(grace.counts.main.available,1);assert.equal(grace.counts.overview.missing,0);
 const aged=ageLiveCoverage(coverage,end,end+600,end+600);
 assert.equal(aged.counts.overview.missing,1);assert.equal(aged.coverage[0].pending,false);
 assert.equal(aged.coverage[1].pending,true);assert.equal(aged.complete,false);
});
