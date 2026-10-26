import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIrradiance,selectHaReadings} from '../public/weather-policy.js';
test('irradiance snapshots accept unchanged day/night values and retain report provenance without changing historic samples',()=>{
 const now=Date.now(),entity='sensor.solar',policy={source:'ha',mappings:{irradiance:entity},sourceUnits:{irradiance:'W/m²'},units:{}};
 const state={state:'0',last_reported:new Date(now-86400000).toISOString(),attributes:{unit_of_measurement:'W/m²'}};
 const read=(s=state,at=now)=>selectHaReadings(policy,{[entity]:normalizeIrradiance(s,now)},null,at).irradiance;
 for(const value of ['0','800']){const row=read({...state,state:value});assert.equal(row.value,Number(value));assert.equal(row.time,now);assert.equal(row.reportedAt,now-86400000);assert.equal(row.basis,'ha-acquired-irradiance');}
 for(const value of ['unknown','unavailable','','-1','Infinity'])assert.equal(read({...state,state:value}).source,null);
 assert.equal(read(state,now+600001).source,null);
 assert.equal(read({...state,last_reported:undefined}).source,null);
 assert.equal(read({...state,last_reported:new Date(now+300001).toISOString()}).source,null);
 assert.equal(read({...state,attributes:{unit_of_measurement:'lux'}}).source,null);
 const old={value:0,unit:'W/m²',time:now-86400000,receivedAt:now,basis:'ha-reported'};
 assert.equal(selectHaReadings(policy,{[entity]:old},null,now).irradiance.source,null);
});
