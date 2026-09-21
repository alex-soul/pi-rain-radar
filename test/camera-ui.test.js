import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraAt,cameraWindowCounts} from '../public/camera-model.js';
import {visibleRadarSources,weatherCreditVisible} from '../public/attribution.js';
import {statsSnapshot} from '../public/stats-format.js';

test('camera replay looks back inclusively across sources, never forward, and counts no carry-in duplication',()=>{
  const records=[{time:1000000,source:'old',basis:'metadata'},{time:1300000,source:'new',basis:'acquisition'}];
  assert.equal(cameraAt(records,999999),null);assert.equal(cameraAt(records,1299999).source,'old');assert.equal(cameraAt(records,1900000).source,'new');assert.equal(cameraAt(records,1900001),null);
  assert.deepEqual(cameraWindowCounts(records,1000001,1500000),{metadata:0,acquisition:1});
  const snapshot=statsSnapshot({status:{camera:{state:'fresh'}},selected:{hours:24,end:5000},hours:2,cameraCounts:{metadata:12,acquisition:3}});
  assert.equal(snapshot.windowLabel,'Archive · 24 h');assert.equal(snapshot.camera.state,'fresh');assert.deepEqual(snapshot.cameraCounts,{metadata:12,acquisition:3});
});
test('attribution follows visible actual or expected-gap sources, independent of background providers',()=>{
  const args={frame:{source:'rainviewer',expectedSources:{overview:'rainbow'}},currentSources:{main:{source:'rainbow'}},archive:true};
  assert.deepEqual([...visibleRadarSources(args)],['rainviewer']);
  assert.deepEqual([...visibleRadarSources({...args,overviewVisible:true})],['rainviewer','rainbow']);
  assert.deepEqual([...visibleRadarSources({frame:{expectedSources:{main:'rainbow'}},archive:true})],['rainbow']);
  assert.deepEqual([...visibleRadarSources({...args,observations:[{source:'rainbow'}]})],['rainbow']);
  for(const dockExpanded of [false,true])for(const forecastVisible of [false,true])assert.equal(weatherCreditVisible({dockExpanded,forecastVisible}),dockExpanded||forecastVisible);
});
