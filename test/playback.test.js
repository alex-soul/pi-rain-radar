import test from 'node:test';
import assert from 'node:assert/strict';
import {mapObservation,playbackState,frameProvider,windowProviders} from '../public/playback.js';
const main={time:10000,url:'/main',source:'rainviewer',expectedSources:{main:'rainviewer'}};
const partial=time=>({time,url:null,overviewUrl:'/overview',expectedSources:{main:'rainviewer'}});
test('Live borrowing stops exactly at thirty minutes and Archive never borrows',()=>{
  assert.equal(mapObservation([main,partial(11799)],1,'main').url,'/main');
  assert.equal(mapObservation([main,partial(11800)],1,'main'),null);
  assert.equal(mapObservation([main,partial(10600)],1,'main',true),null);
  assert.equal(mapObservation([partial(9400),main],0,'main'),null);
  assert.equal(mapObservation([main,{...partial(10600),expectedSources:{main:'rainbow'}}],1,'main'),null);
});
test('automatic waiting preserves play intent while explicit pause never resumes on recovery',()=>{
  for(const count of [0,1])assert.equal(playbackState(true,count),'waiting');
  assert.equal(playbackState(true,2),'playing');
  for(const count of [0,1,2,145])assert.equal(playbackState(false,count),'paused');
  assert.equal(playbackState(true,1,true),'paused');
});

test('the first Live position can borrow a compatible pre-window observation without adding a playable slot',()=>{
  const frames=[partial(10600)];frames.borrowFrames=[main];
  assert.equal(mapObservation(frames,0,'main').url,'/main');
  assert.equal(frames.length,1);
  assert.equal(mapObservation(frames,0,'main',true),null);
});

test('provider names and window credits survive map gaps without inventing unknown provenance',()=>{
  const missing={time:10600,url:null,overviewUrl:'/overview',source:null,overviewSource:'rainbow',expectedSources:{main:'rainviewer',overview:'rainbow'}};
  assert.equal(frameProvider(missing,'main'),'rainviewer');
  assert.equal(mapObservation([missing],0,'main',true),null);
  assert.equal(frameProvider({time:10600},'main'),null);
  assert.deepEqual([...windowProviders([main,missing])].sort(),['rainbow','rainviewer']);
  const empty=[];empty.coverage=[{sources:{main:'rainbow',overview:'rainviewer'}}];
  assert.deepEqual([...windowProviders(empty)].sort(),['rainbow','rainviewer']);
  assert.deepEqual([...windowProviders([{expectedSources:{main:'unknown'}}])],[]);
  assert.equal(frameProvider({...missing,source:'rainbow'},'main'),'rainbow');
});
