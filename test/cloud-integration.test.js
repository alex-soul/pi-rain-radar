import test from 'node:test';
import assert from 'node:assert/strict';
import {observedClouds,withObservedClouds} from '../src/aviation-clouds.js';
import {cloudObservation} from '../public/cloud-observation.js';
import {aviationAt} from '../public/aviation-model.js';
import {migrateAviationGroup} from '../public/aviation-group-model.js';
const observedAt=Date.parse('2026-10-13T10:20Z'),station='EGBB';
const make=(clouds,tail='')=>withObservedClouds({product:'metar',station,observedAt,acquiredAt:observedAt+60000,raw:`METAR EGBB 131020Z 24008KT 9999 ${clouds} 14/10 Q1017 ${tail}`});
const state=(r=make('FEW006 BKN014 OVC028'))=>({enabled:true,station,reports:{metar:r},products:{metar:{state:'ready',lastSuccess:observedAt+60000,reportAcquiredAt:r.acquiredAt}}});
test('observed extraction excludes forecasts/remarks and has no four-group cap',()=>{
 for(const boundary of ['TEMPO','BECMG','INTER','PROB30 TEMPO','FM1200','NOSIG','RMK'])assert.equal(make('BKN020',boundary+' SCT005').clouds.raw,'BKN020');
 const r=make('FEW001 SCT005 BKN010 BKN020 OVC080');assert.equal(r.clouds.layers.length,5);
 assert.equal(make('VV///').clouds.layers[0].baseFt,null);assert.equal(make('VV000').clouds.layers[0].baseFt,0);
 assert.equal(make('SCT/// BKN020CB').clouds.layers[1].type,'CB');
 for(const code of ['CAVOK','SKC','CLR','NSC','NCD'])assert.equal(make(code).clouds.state,'clear');
 assert.equal(make('BKNbad').clouds.state,'error');assert.equal(make('VV010 BKN020').clouds.state,'error');
});
test('backend seeds survive refetch, restart and historical enrichment',()=>{
 const r=make('BKN020');assert.equal(r.clouds.seed,make('BKN020').clouds.seed);assert.equal(withObservedClouds(r),r);
 const old={...r};delete old.clouds;assert.deepEqual(withObservedClouds(JSON.parse(JSON.stringify(old))),r);
 assert.notEqual(make('BKN021').clouds.seed,r.clouds.seed);
 assert.notEqual(observedClouds(r.raw,{station,observedAt:observedAt+86400000}).seed,r.clouds.seed);
});
test('collection failures retain until 90 minutes, with error precedence and historical clock',()=>{
 const s=state(),t=observedAt+5*60000;
 assert.equal(cloudObservation(s,t).dataState,'fresh');s.products.metar.state='error';
 assert.equal(cloudObservation(s,t).dataState,'error');assert.equal(cloudObservation(s,t).report.state,'layers');
 assert.equal(cloudObservation(s,observedAt+90*60000).report.state,'layers');
 assert.equal(cloudObservation(s,observedAt+90*60000+1).report.state,'missing');assert.equal(cloudObservation(s,observedAt+90*60000+1).dataState,'error');
 s.products.metar.state='ready';assert.equal(cloudObservation(s,observedAt+91*60000).dataState,'expired');assert.equal(cloudObservation(s,observedAt+17*60000).dataState,'stale');
 s.products.metar.state='missing';assert.equal(cloudObservation(s,t).dataState,'unavailable');s.enabled=false;assert.equal(cloudObservation(s,t).dataState,'not-configured');
});
test('Archive uses acquisition boundaries and status evidence at selected time',()=>{
 const r=make('BKN020'),s=state(r),next=make('OVC010');next.acquiredAt=r.acquiredAt+600000;
 const history={states:[{...s,time:r.acquiredAt},{...state(next),time:next.acquiredAt}],reports:[r,next]};
 assert.equal(cloudObservation(aviationAt(history,r.acquiredAt-1),r.acquiredAt-1).dataState,'not-configured');
 assert.equal(cloudObservation(aviationAt(history,next.acquiredAt-1),next.acquiredAt-1).report.raw,'BKN020');
 assert.equal(cloudObservation(aviationAt(history,next.acquiredAt),next.acquiredAt).report.raw,'OVC010');
 assert.equal(cloudObservation({...s,station:'EGLL'},r.acquiredAt).report.state,'missing');
});
test('legacy METAR-only upgrade preserves visibility, with Clouds for next opening only',()=>{
 const s=migrateAviationGroup(null,{split:true,visible:{metar:true,taf:false}},{visible:true,x:372,y:537});
 assert.deepEqual(s,{split:true,selected:{metar:true,taf:false,clouds:true},open:{metar:true,taf:false,clouds:false}});
 assert.deepEqual(migrateAviationGroup(s,{visible:{metar:false}},{}),s);
 assert.deepEqual(migrateAviationGroup(null,null,null).open,{metar:false,taf:false,clouds:false});
 assert.deepEqual(migrateAviationGroup(null,{visible:{metar:false,taf:false}},{visible:true}).open,{metar:false,taf:false,clouds:false});
});

test('startup before status arrives and configured stations without a report remain safe',()=>{
 for(const value of [undefined,null,{}, {enabled:false}])assert.equal(cloudObservation(value,observedAt).dataState,'not-configured');
 assert.equal(cloudObservation({enabled:true,station},observedAt).dataState,'unavailable');
});
