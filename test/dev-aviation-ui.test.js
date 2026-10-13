import test from 'node:test';
import assert from 'node:assert/strict';
import {aviationReviewReports} from '../scripts/dev-aviation-ui-fixture.js';
test('DEV Aviation review supplies production explanations for every METAR and TAF token',()=>{
  const cases=aviationReviewReports();
  for(const reports of Object.values(cases))for(const report of Object.values(reports)){
    assert.ok(report.sections.length>5);
    const explained=report.sections.map(s=>report.raw.slice(s.start,s.end)).join(' ');
    assert.equal(explained,report.raw.trim().replace(/\s+/g,' '));
  }
  const section=(p,code)=>cases.layered[p].sections.find(s=>cases.layered[p].raw.slice(s.start,s.end)===code);
  assert.match(section('metar','24008KT').meaning,/Wind/);
  assert.match(section('metar','BKN014').meaning,/1400 ft/);
  assert.match(section('taf','BECMG 1318/1321').meaning,/Conditions becoming/);
});
