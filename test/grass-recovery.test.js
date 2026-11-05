import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceGrassWetness as advance} from '../public/grass-wetness-model.js';
import {advanceGrassWetness as legacy} from '../public/grass-wetness-model-v1.js';
import {grassLabFixture} from '../scripts/dev-grass-lab.mjs';
import {buildRecordedLab} from '../src/grass-lab-data.js';
import {replayGrass} from '../public/grass-replay.js';

const start=1800000000000,minute=60000;
const template=grassLabFixture(start).samples[0].snapshot;
function input(at,total=0){
 const snapshot=structuredClone(template);
 for(const [key,row]of Object.entries(snapshot.rows))Object.assign(row,{time:at,receivedAt:at,value:{temperature:12,dew:5,wind:10,irradiance:300}[key]});
 Object.assign(snapshot.observedRain,{value:total,time:at,receivedAt:at,resetAt:start-86400000});
 return snapshot;
}
function mature(){let state;for(let i=0;i<=6;i++)({state}=advance(state,input(start+i*5*minute),start+i*5*minute));return state;}
test('cold and long-gap starts begin at zero; short interruptions preserve a mature reservoir without inferred weather',()=>{
 const initial=advance(null,input(start),start);assert.equal(initial.state.moisture,0);assert.equal(initial.reading.eligible,false);
 const state=mature();state.moisture=1.7;const before=structuredClone(state),last=state.baseline.time;
 const missing=input(last+5*minute);missing.rows.irradiance.value=null;
 const unavailable=advance(state,missing,last+5*minute);assert.equal(unavailable.reading.eligible,false);assert.equal(unavailable.state.moisture,1.7);
 const recovered=advance(unavailable.state,input(last+10*minute+524),last+10*minute+524);
 assert.equal(recovered.reading.eligible,true);assert.equal(recovered.state.moisture,1.7);assert.equal(recovered.state.startedAt,state.startedAt);
 assert.equal(advance(state,input(last+30*minute),last+30*minute).state.moisture,1.7,'exactly 30 minutes can resume');
 const long=advance(state,input(last+30*minute+1),last+30*minute+1);
 assert.equal(long.state.moisture,0);assert.equal(long.reading.eligible,false);
 assert.deepEqual(state,before);
 assert.equal(advance(state,input(last+5*minute),last+5*minute).state.moisture<1.7,true,'normal readings still dry the reservoir');
});
test('recovery counts proven cumulative rain once and refuses unproven resets or changed sources',()=>{
 const state=mature(),last=state.baseline.time,at=last+15*minute;
 const result=advance(state,input(at,.4),at);assert.equal(result.reading.eligible,true);assert.ok(Math.abs(result.state.moisture-.6)<1e-10);
 assert.equal(advance(result.state,input(at,.4),at+1).state.moisture,result.state.moisture);
 const reset=input(at,.2);reset.observedRain.resetAt=at;reset.observedRain.previousPeriod=.3;
 assert.equal(advance(state,reset,at).state.moisture,.75);
 delete reset.observedRain.previousPeriod;const unknown=advance(state,reset,at);assert.equal(unknown.state.moisture,0);assert.equal(unknown.reading.eligible,false);
 const changed=input(at);changed.rows.wind.entity='new-sensor';assert.equal(advance(state,changed,at).reading.eligible,false);
 const backwards=input(last-1);assert.equal(advance(state,backwards,last).reading.eligible,false);
});
test('freshness stays strict, repeated acquisitions cannot end an outage, and incomplete warm-up restarts at zero',()=>{
 const state=mature(),last=state.baseline.time;
 const stale=advance(state,input(last),last+10*minute+1);assert.equal(stale.reading.eligible,false);
 const invalid=input(last);invalid.rows.wind.value=null;
 const failed=advance(state,invalid,last+1);
 assert.equal(advance(failed.state,input(last),last+2).reading.eligible,false);
 let partial=advance(null,input(start),start).state;partial.moisture=1;
 partial=advance(partial,invalid,start+minute).state;
 const restarted=advance(partial,input(start+10*minute),start+10*minute);
 assert.equal(restarted.state.moisture,0);assert.equal(restarted.state.startedAt,start+10*minute);assert.equal(restarted.reading.eligible,false);
});
test('mixed historical model versions replay exactly across upgrade, missing readings, recovery and retained boundaries',()=>{
 let state;const presentations=[];
 for(let i=0;i<24;i++){
  const at=start+i*5*minute,snapshot=input(at,i<10?i*.1:1);
  if(i===15)snapshot.rows.irradiance.value=null;
  const result=(i<12?legacy:advance)(state,snapshot,at);state=result.state;
  presentations.push({time:at/1000,...snapshot,grassWetness:result.reading,grassState:structuredClone(state)});
 }
 const history={presentations,capturedAt:start+120*minute},tracker={values:[],timeZone:'Europe/London'};
 const data=buildRecordedLab(history,tracker);assert.equal(data.validation.mismatches,0);
 assert.deepEqual([...new Set(data.samples.map(s=>s.modelVersion))],[1,2]);
 assert.equal(buildRecordedLab({...history,presentations:presentations.slice(13)},tracker).validation.mismatches,0);
 assert.equal(buildRecordedLab({...history,presentations:presentations.slice(15)},tracker).validation.mismatches,0,'an unavailable retained boundary preserves interruption state');
 const before=structuredClone(data);replayGrass(data.samples,{...data.parameters,dew:3},data.initialState);assert.deepEqual(data,before);
 const old=legacy(null,input(start),start);assert.equal(old.state.moisture,2.5);
 const migrated=advance({...mature(),modelVersion:1,moisture:1.25},input(start+30*minute),start+30*minute);
 assert.equal(migrated.state.modelVersion,2);assert.equal(migrated.state.moisture,1.25);assert.equal(migrated.reading.eligible,true);
 assert.throws(()=>replayGrass([{time:start,modelVersion:99,snapshot:input(start)}]),/Unsupported/);
});
