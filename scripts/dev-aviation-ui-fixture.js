import {cloudScenarios,parseCloudGroups} from './dev-cloud-layers-model.js';
import {decodeAviation} from '../src/aviation-decoder.js';

export function aviationReviewReports(){
  const observedAt=Date.parse('2026-10-13T10:20:00Z'),issuedAt=Date.parse('2026-10-13T11:00:00Z');
  const cases=[...cloudScenarios,...['CLR','NSC','NCD','BKN///'].map(code=>({id:code,codes:code}))];
  return Object.fromEntries(cases.map(s=>{
    const cloud=parseCloudGroups(s.codes),raw='EGBB 131020Z 24008KT 9999 '+cloud.raw+' 14/10 Q1017';
    const taf='TAF EGBB 131100Z 1312/1412 24008KT 9999 SCT025 BECMG 1318/1321 BKN014';
    return [s.id,{metar:{raw,...decodeAviation(raw,{product:'metar',station:'EGBB',observedAt})},taf:{raw:taf,...decodeAviation(taf,{product:'taf',station:'EGBB',issuedAt})}}];
  }));
}
