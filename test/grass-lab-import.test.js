import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecordedLab,importTracker,trackerTime} from '../scripts/grass-lab-import.mjs';
import {advanceGrassWetness} from '../public/grass-wetness-model.js';
import {grassLabFixture} from '../scripts/dev-grass-lab.mjs';
import {replayGrass} from '../public/grass-replay.js';

const tracker={spreadsheetId:'fixture-sheet',sheet:'Sheet1',timeZone:'Europe/London',year:2026,values:[['Date','Time','Int','Pi','Notes'],['28 Oct ','22:22','3','0','Light fog '],['2 Nov','19:43','--','--','Dew Wetting changed to 3x']]};
function history(){
 const samples=grassLabFixture(Date.UTC(2026,10,2)).samples.slice(0,24);let state=null;
 const presentations=samples.map((s,i)=>{
   s.snapshot.location='private-location';s.snapshot.rows.wind.entity='private-sensor';
   if(i>=8)s.snapshot.policy.grassWetness.dew=3;
   if(i===12)s.snapshot.rows.temperature.value=null;
   const result=advanceGrassWetness(state,s.snapshot,s.time);state=result.state;
   return {time:s.time/1000,...s.snapshot,grassWetness:result.reading};
 });
 return {capturedAt:samples.at(-1).time,appVersion:'fixture',presentations};
}
test('tracker import preserves source cells, times and settings notes without counting notes as observations',()=>{
 const result=importTracker(tracker);
 assert.equal(result.observations.length,1);assert.equal(result.markers.length,1);
 assert.equal(result.observations[0].observedAt,Date.UTC(2026,9,28,22,22));
 assert.equal(result.observations[0].reportedPi,0);assert.equal(result.observations[0].note,'Light fog');
 assert.deepEqual(result.observations[0].source.values,tracker.values[1]);
 assert.equal(trackerTime('1 Jul','10:00',2026),Date.UTC(2026,6,1,9));
 assert.throws(()=>trackerTime('25 Oct','01:30',2026),/Ambiguous/);
 assert.throws(()=>trackerTime('31 Feb','12:00',2026),/invalid/);
});
test('real-data adapter verifies changes and unavailable intervals while removing private identifiers',()=>{
 const input=history(),before=structuredClone(input),data=buildRecordedLab(input,tracker);
 assert.equal(data.validation.mismatches,0);assert.equal(data.validation.compared,24);
 assert.equal(data.transitions.length,1);assert.equal(data.recorded[12].value,null);
 assert.ok(!JSON.stringify(data).includes('private-location'));assert.ok(!JSON.stringify(data).includes('private-sensor'));
 assert.deepEqual(input,before);
 const original=replayGrass(data.samples,null,data.initialState);
 const candidate=replayGrass(data.samples,{...data.parameters,dew:0},data.initialState);
 assert.ok(candidate.some((p,i)=>p.moisture!==original[i].moisture));
});
test('a partial export resumes from its saved boundary state and fails closed on a baseline mismatch',()=>{
 const input=history();input.presentations=input.presentations.slice(5);
 const data=buildRecordedLab(input,tracker);
 assert.equal(data.validation.seededFromBoundary,true);assert.equal(data.validation.mismatches,0);
 input.presentations[2].grassWetness.moisture+=.2;
 assert.throws(()=>buildRecordedLab(input,tracker),/Baseline verification failed/);
});
