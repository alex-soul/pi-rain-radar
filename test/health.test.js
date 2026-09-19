import test from 'node:test';
import assert from 'node:assert/strict';
import { radarSourceHealth, worstHealth } from '../public/health.js';

test('radar severity uses acquisition time even when provider warning masks stale state', () => {
  const now = 1800000000000;
  const ready = {time: now/1000-600, state:'ready'};
  const classify = source => radarSourceHealth(source,true,now)[0];
  assert.equal(classify(ready),'ready');
  assert.equal(classify({...ready,error:'Refresh failed',state:'warning'}),'warning');
  assert.equal(classify({...ready,time:now/1000-1800,error:'Refresh failed',state:'warning'}),'error');
  assert.equal(classify({...ready,time:now/1000-1799}),'ready');
  assert.equal(classify({time:null,fetching:true}),'warning');
  assert.equal(classify({time:null,checkedAt:now,error:'First acquisition failed'}),'error');
  assert.equal(classify({time:null,checkedAt:now}),'error');
  assert.equal(radarSourceHealth(ready,false,now)[0],'error');
  assert.equal(worstHealth([radarSourceHealth(ready,true,now),['error','Overview stale']])[0],'error');
  assert.equal(worstHealth([['warning','Main delayed'],['ready','Overview ready']])[0],'warning');
});
