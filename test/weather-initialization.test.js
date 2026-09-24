import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Readable} from 'node:stream';
import {createWeatherSettings} from '../src/weather-settings.js';
import {createHistoryStore} from '../src/history-store.js';
import {settingsRoutes} from '../src/settings-auth.js';
import {defaultUnits,unitChoices,weatherFields} from '../public/weather-policy.js';
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'radar-units-test-'));const store=await createHistoryStore(dir);t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});const settingsFile=join(dir,'policy.json');return {store,settingsFile,settings:await createWeatherSettings(store,{settingsFile})};}
async function request(route,path,input,headers={}){
  const req=Readable.from(input===undefined?[]:[JSON.stringify(input)]);req.method=input===undefined?'GET':'POST';req.headers={'content-type':'application/json',host:'localhost',...headers};
  const result={};const res={writeHead(status){result.status=status;},end(body){result.data=JSON.parse(body);}};await route(req,res,path);return result;
}
test('simultaneous browsers adopt only the first units, persist a baseline and keep it on restart',async t=>{
  const f=await fixture(t),units={...defaultUnits,temperatureUnit:'F',windUnit:'km/h'};
  const [a,b]=await Promise.all([f.settings.initialize(units),f.settings.initialize(defaultUnits)]);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.units,units);assert.deepEqual(b.units,units);
  const restored=await createWeatherSettings(f.store,{settingsFile:f.settingsFile});await restored.initialize(defaultUnits);assert.deepEqual(restored.current().baseline,units);
  await restored.configure({units:{temperatureUnit:'C'}});assert.deepEqual(restored.current().baseline,units);
});
test('first-browser adoption is available behind a PIN, defaults work and established units cannot be overwritten',async t=>{
  const f=await fixture(t),route=settingsRoutes({authorized:async()=>false},null,null,{weatherSettings:f.settings});
  assert.equal((await request(route,'/api/settings/weather/initialize',{units:defaultUnits},{origin:'http://other.test'})).status,403);
  assert.equal(f.settings.current().initialized,false);
  assert.equal((await request(route,'/api/settings/weather/initialize',{units:{temperatureUnit:'bad'}})).status,400);
  assert.equal((await request(route,'/api/settings/weather/initialize',{units:defaultUnits})).status,200);
  const again=await request(route,'/api/settings/weather/initialize',{units:{...defaultUnits,temperatureUnit:'F'},owmCollect:true});
  assert.equal(again.data.units.temperatureUnit,'C');assert.equal(again.data.owmCollect,false);
});
test('weather discovery has no off-state calls and discards results after policy changes; camera discovery stays independent',async t=>{
  const f=await fixture(t);await f.settings.initialize(defaultUnits);let calls=0,release;
  const ha={status:()=>({configured:true,revision:1}),discover:async()=>{calls++;return new Promise(resolve=>{release=resolve;});}};
  const route=settingsRoutes({authorized:async()=>true},null,null,{weatherSettings:f.settings,ha});
  assert.deepEqual((await request(route,'/api/settings/home-assistant/entities')).data.entities,[]);assert.equal(calls,0);
  await f.settings.configure({haCollect:true});const pending=request(route,'/api/settings/home-assistant/entities');await new Promise(resolve=>setImmediate(resolve));
  await f.settings.configure({haCollect:false});release([{id:'sensor.t'},{id:'camera.drive'}]);assert.deepEqual((await pending).data.entities,[]);assert.equal(calls,1);
  // The connection itself remains configured; this gate belongs to weather only.
  assert.equal(ha.status().configured,true);
});
test('browser captures saved units before status hydration and sends them without opening Settings',async()=>{
  const saved={...defaultUnits,temperatureUnit:'F',windUnit:'kn'};let submitted;
  const code=(await readFile(new URL('../public/integrations-state.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
  const context=vm.createContext({defaultUnits,unitChoices,weatherFields,localStorage:{getItem:()=>JSON.stringify(saved)},window:{dispatchEvent(){}},Event,AbortSignal,
    fetch:async(url,options)=>{submitted=JSON.parse(options.body);return {ok:true,json:async()=>({status:200,initialized:true,revision:1,units:submitted.units})};}});
  vm.runInContext(code,context);
  // A competing status hydrates default units, but cannot change the captured input.
  context.acceptIntegrationStatus({weatherPolicy:{initialized:false,units:defaultUnits,revision:0}});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(submitted.units,saved);
  context.acceptIntegrationStatus({weatherPolicy:{initialized:true,units:defaultUnits,revision:2}});
  assert.equal(vm.runInContext('shared.units.temperatureUnit',context),'C');
});
test('interrupted initialization can retry without replacing an established baseline',async t=>{
  const f=await fixture(t),save=f.store.saveWeatherPolicy;let fail=true;
  f.store.saveWeatherPolicy=async value=>{if(fail)throw Error('simulated interruption');return save(value);};
  await assert.rejects(f.settings.initialize(defaultUnits),/simulated interruption/);assert.equal(f.settings.current().initialized,false);
  fail=false;await f.settings.initialize({...defaultUnits,temperatureUnit:'F'});
  const reopened=await createWeatherSettings(f.store,{settingsFile:f.settingsFile});assert.equal(reopened.current().baseline.temperatureUnit,'F');
});
test('legacy OpenWeather display migrates inactive HA alternatives without silently activating them',async t=>{
  const f=await fixture(t),old={...f.settings.current(),perReadingSources:undefined,source:'openweather',haCollect:true,mappings:{...f.settings.current().mappings,temperature:'sensor.inactive'}};
  await f.store.saveWeatherState('policy',old);
  const migrated=await createWeatherSettings(f.store);
  assert.equal(migrated.current().mappings.temperature,'owm');assert.equal(migrated.current().source,'openweather');assert.equal(migrated.current().perReadingSources,true);
});

test('fresh install disables every reading; persisted choices and pre-policy OWM upgrades survive',async t=>{
  const f=await fixture(t);
  assert.ok(weatherFields.every(field=>f.settings.current().mappings[field]==='disabled'));
  assert.equal(f.settings.current().owmCollect,false);
  assert.equal(f.settings.current().forecastCollect,false);
  await f.settings.initialize(defaultUnits);
  await f.settings.configure({mappings:{temperature:'owm'}});
  const reopened=await createWeatherSettings(f.store,{settingsFile:f.settingsFile,owmEnabled:true});
  assert.equal(reopened.current().mappings.temperature,'owm');
  assert.equal(reopened.current().mappings.gust,'disabled');
  assert.equal(reopened.current().owmCollect,false);
  const legacyStore={weatherState:async()=>null,saveWeatherState:async()=>{}};
  const legacy=await createWeatherSettings(legacyStore,{owmEnabled:true});
  assert.ok(weatherFields.every(field=>legacy.current().mappings[field]==='owm'));
  assert.equal(legacy.current().owmCollect,true);
});
