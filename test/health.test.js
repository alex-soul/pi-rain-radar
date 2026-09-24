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

import {cloudHandleHealth} from '../public/health.js';
test('handle tolerates ordinary radar/cloud delays but preserves failures and exact stale boundary',()=>{
 const now=1800000000000;
 const radar={time:now/1000-1440,state:'warning'};
 const cloud={enabled:true,map:'both',state:'delayed',lastSuccess:now-60000,latest:{main:now-1440000,overview:now-1450000}};
 assert.equal(radarSourceHealth(radar,true,now)[0],'ready');
 assert.equal(cloudHandleHealth(cloud,true,now)[0],'ready');
 assert.equal(cloudHandleHealth({...cloud,latest:{...cloud.latest,overview:now-1800000}},true,now)[0],'error');
 assert.equal(cloudHandleHealth({...cloud,latest:{...cloud.latest,overview:now-1799999}},true,now)[0],'ready');
 assert.equal(radarSourceHealth({...radar,time:now/1000-1800},true,now)[0],'error');
 assert.equal(cloudHandleHealth({...cloud,state:'error',error:'Failed'},true,now)[0],'error');
 assert.equal(cloudHandleHealth({...cloud,state:'budget'},true,now)[0],'warning');
 assert.equal(cloudHandleHealth({...cloud,latest:{main:now}},true,now)[0],'error');
 assert.equal(cloudHandleHealth({...cloud,latest:{},lastSuccess:null},true,now)[0],'warning');
 assert.equal(cloudHandleHealth({...cloud,enabled:false},true,now)[0],'unconfigured');
 assert.equal(cloudHandleHealth({...cloud,map:'main',latest:{main:now}},true,now)[0],'ready');
 assert.equal(cloudHandleHealth(cloud,false,now)[0],'error');
 assert.equal(cloudHandleHealth(cloud,true,now)[0],'ready');
 assert.equal(worstHealth([radarSourceHealth(radar,true,now),cloudHandleHealth(cloud,true,now)])[0],'ready');
});
