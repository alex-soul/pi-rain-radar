import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHomeAssistant} from '../src/home-assistant.js';
import {createWeatherSettings} from '../src/weather-settings.js';
import {createHistoryStore} from '../src/history-store.js';
import {normalizeHaReading,selectHaReadings,defaultUnits} from '../public/weather-policy.js';

const start=Date.now();
async function directory(t){const dir=await mkdtemp(join(tmpdir(),'radar-ha-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('RC2 HA credential import preserves camera identity and secret never enters status/discovery',async t=>{
  const dir=await directory(t);await mkdir(join(dir,'settings'));
  const original={version:1,enabled:true,config:{id:'keep-me',mode:'ha',url:'http://ha.test:8123',entity:'camera.drive',auth:{mode:'bearer',token:'secret'}}};
  await writeFile(join(dir,'settings','camera.json'),JSON.stringify(original));
  let time=start,calls=[];
  const ha=await createHomeAssistant(dir,{autoStart:false,now:()=>time,get:async(url,options)=>{calls.push([url,options.auth]);return Buffer.from(JSON.stringify(url.endsWith('/states')?[{entity_id:'camera.drive',attributes:{friendly_name:'Drive',access_token:'secret'}},{entity_id:'sensor.t',attributes:{unit_of_measurement:'°C'}}]:{message:'API running.'}));}});
  t.after(()=>ha.close());
  await ha.probe();await ha.probe();assert.equal(calls.length,1);
  time+=300000;await ha.probe();assert.equal(calls.length,2);
  assert.equal(ha.status().state,'connected');assert.equal(JSON.stringify(ha.status()).includes('secret'),false);
  assert.deepEqual(calls[0][1],{mode:'bearer',token:'secret'});
  assert.equal(JSON.stringify(await ha.discover()).includes('secret'),false);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'settings','camera.json'),'utf8')),original);
});
test('HA failed replacement preserves connection, explicit removal survives restart, paths cannot escape API',async t=>{
  const dir=await directory(t);let fail=false;
  const ha=await createHomeAssistant(dir,{autoStart:false,get:async()=>{if(fail)throw Object.assign(Error('secret in upstream message'),{code:'CAMERA_AUTH'});return Buffer.from('{"message":"ok"}');}});
  t.after(()=>ha.close());
  await ha.configure({url:'http://ha.test:8123',token:'first'});fail=true;
  await assert.rejects(ha.configure({url:'http://other.test:8123',token:'second'}),{code:'HA_AUTH'});
  assert.equal(ha.status().url,'http://ha.test:8123');
  await assert.rejects(ha.bytes('/api/states/../../config'),{code:'HA_CONFIG'});
  await assert.rejects(ha.configure({url:'http://user:password@ha.test',token:'secret'}),{code:'HA_CONFIG'});
  await ha.configure({remove:true});ha.close();
  const reopened=await createHomeAssistant(dir,{autoStart:false});t.after(()=>reopened.close());assert.equal(reopened.status().configured,false);
  assert.equal(reopened.status().revision,2);
});
test('HA repeated acquisition does not renew report freshness; zero is valid and incompatible units trigger only temporary fallback',()=>{
  const input={state:'0',last_reported:new Date(start).toISOString(),attributes:{unit_of_measurement:'°C'}};
  const sample=normalizeHaReading(input,start),policy={source:'ha',fallback:true,mappings:{temperature:'sensor.t',feels:'owm',wind:'owm',gust:'owm'},units:{...defaultUnits}};
  const owm={configured:true,data:{current:{time:start/1000,temperature:12,feelsLike:11,windMph:5,gustMph:7}},fetchedAt:start};
  let rows=selectHaReadings(policy,{'sensor.t':sample},owm,start);assert.equal(rows.temperature.source,'ha');assert.equal(rows.temperature.value,0);assert.equal(rows.feels.fallback,false);
  const later=normalizeHaReading(input,start+600001);assert.equal(later.time,start);
  rows=selectHaReadings(policy,{'sensor.t':later},owm,start+600001);assert.equal(rows.temperature.fallback,true);assert.equal(rows.temperature.value,12);
  rows=selectHaReadings({...policy,units:{...defaultUnits,temperatureUnit:'F'}},{'sensor.t':sample},owm,start);assert.match(rows.temperature.reason,/Unit mismatch/);assert.equal(rows.temperature.fallback,true);
  rows=selectHaReadings({...policy,fallback:false,units:{...defaultUnits,temperatureUnit:'F'}},{'sensor.t':sample},owm,start);assert.equal(rows.temperature.source,null);
  rows=selectHaReadings(policy,{'sensor.t':normalizeHaReading({...input,last_reported:undefined},start)},owm,start);assert.match(rows.temperature.reason,/timestamp unavailable/);
  rows=selectHaReadings(policy,{'sensor.t':normalizeHaReading({...input,state:'unavailable'},start)},owm,start);assert.equal(rows.temperature.fallback,true);
});
test('shared policy and effective boundary commit together; baseline is immutable after first explicit choice',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-ha-policy-')),store=await createHistoryStore(dir,{now:start});t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});let time=start;
  const settings=await createWeatherSettings(store,{now:()=>time,owmEnabled:true,rainbowEnabled:true});
  assert.equal(settings.current().initialized,false);assert.equal(settings.current().owmCollect,true);
  assert.equal((await settings.configure({haCollect:true})).status,400);
  assert.equal((await settings.configure({confirmUnits:true,units:{windUnit:'km/h'}})).status,200);
  time+=1000;await settings.configure({units:{temperatureUnit:'F'}});
  assert.equal((await store.contextBefore({source:'weather-policy',context:'appliance',end:start})).data.units.temperatureUnit,'C');
  assert.equal((await store.contextBefore({source:'weather-policy',context:'appliance',end:time})).data.units.temperatureUnit,'F');
  const reopened=await createWeatherSettings(store);assert.equal(reopened.current().baseline.temperatureUnit,'C');assert.equal(reopened.current().units.temperatureUnit,'F');
  assert.equal((await reopened.configure({mappings:{temperature:'light.bad'}})).status,400);
});

test('archive replacement restores disabled feeds and the immutable unit baseline from durable settings',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-policy-recovery-'));
  const original=await createHistoryStore(join(dir,'original'),{now:start});
  const fresh=await createHistoryStore(join(dir,'fresh'),{now:start});
  t.after(async()=>{await original.close();await fresh.close();await rm(dir,{recursive:true,force:true});});
  const settingsFile=join(dir,'settings','weather.json');
  const settings=await createWeatherSettings(original,{settingsFile,now:()=>start,owmEnabled:true,rainbowEnabled:true});
  await settings.configure({confirmUnits:true,units:{windUnit:'km/h'},owmCollect:false,rainviewerCollect:false,rainbowCollect:false});
  const recovered=await createWeatherSettings(fresh,{settingsFile,owmEnabled:true,rainbowEnabled:true});
  assert.deepEqual(recovered.current(),settings.current());
  assert.equal((await fresh.contextBefore({source:'weather-policy',context:'appliance',end:start})).data.rainviewerCollect,false);
});
