import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createDisplaySettings} from '../src/display-settings.js';
import {createSettingsAuth,settingsRoutes,setPin} from '../src/settings-auth.js';
import {effectiveDisplay,migrateDisplayOverrides,displayDefaults} from '../public/display-options.js';
import {weatherReadings} from '../public/weather-readings.js';
import {readingValues} from '../public/reading-units.js';
import {trendFixture} from '../scripts/dev-weather-trends.mjs';

test('trend DEV scenario preserves Archive discovery responses without a selected window',()=>{
 const discovery={times:[1000,1600],oldest:1000000,newest:1600000};assert.equal(trendFixture(discovery),discovery);
 assert.ok(trendFixture({start:1000,end:4600}).weatherHistory.weather.length>1);
});
import {hourTrend,observationKey} from '../public/weather-trends-model.js';
import {trendWindow} from '../public/local-preferences.js';
import {createHistoryStore} from '../src/history-store.js';
import {createWeatherSettings} from '../src/weather-settings.js';
const now=4000000000;
async function settings(t){const directory=await mkdtemp(join(tmpdir(),'radar-display-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));return {directory,settings:await createDisplaySettings(directory,{temperatureUnit:'F',windUnit:'kn'})};}
test('global display defaults adopt source units once and persist independently',async t=>{
 const f=await settings(t);assert.equal(f.settings.current().values.temperatureUnit,'F');
 assert.equal((await f.settings.configure({values:{temperatureUnit:'C',sunMode:'position'}})).status,200);
 assert.equal((await f.settings.configure({values:{temperatureUnit:'K'}})).status,400);
 assert.equal((await f.settings.configure(JSON.parse('{"values":{"__proto__":"x"}}'))).status,400);
 const reopened=await createDisplaySettings(f.directory,{temperatureUnit:'F'});assert.equal(reopened.current().values.temperatureUnit,'C');assert.equal(reopened.current().values.sunMode,'position');
});
test('first-browser unit adoption seeds display defaults once, with explicit global choices protected',async t=>{
 const f=await settings(t),directory=await mkdtemp(join(tmpdir(),'radar-display-bootstrap-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const pending=await createDisplaySettings(directory,{}, {pendingUnits:true});await pending.adoptUnits({temperatureUnit:'F',windUnit:'kn'});assert.equal(pending.current().values.temperatureUnit,'F');assert.equal(pending.current().values.windUnit,'kn');
 await pending.adoptUnits({temperatureUnit:'C'});assert.equal(pending.current().values.temperatureUnit,'F');
 await f.settings.configure({values:{temperatureUnit:'C'}});await f.settings.adoptUnits({temperatureUnit:'F'});assert.equal(f.settings.current().values.temperatureUnit,'C');
});
test('fresh screens inherit independently; explicit equal choices stay fixed until removed',()=>{
 const global={temperatureUnit:'C',windUnit:'mph',sunMode:'position'},a={},b={temperatureUnit:'C',moonMode:'event'};
 assert.equal(effectiveDisplay(global,a).temperatureUnit,'C');global.temperatureUnit='F';global.moonMode='position';
 assert.equal(effectiveDisplay(global,a).temperatureUnit,'F');assert.equal(effectiveDisplay(global,b).temperatureUnit,'C');assert.equal(effectiveDisplay(global,b).moonMode,'event');
 delete b.temperatureUnit;assert.equal(effectiveDisplay(global,b).temperatureUnit,'F');
 const migrated=migrateDisplayOverrides({temperatureUnit:'C',directionFormat:'degrees'},{sun:'position'},{temperatureUnit:'F',windUnit:'kn'});
 assert.equal(migrated.temperatureUnit,'F');assert.equal(migrated.windUnit,'kn');assert.equal(migrated.directionFormat,'degrees');assert.equal(migrated.sunMode,'position');assert.equal(migrated.moonMode,'event');assert.deepEqual(migrateDisplayOverrides(null,null),{});
});
function haState(){return {configured:true,fetchedAt:now,data:{current:{time:now/1000,temperature:14,dewPoint:8}},presentation:{policy:{source:'ha',haCollect:true,owmCollect:true,units:{...displayDefaults},mappings:{temperature:'sensor.t',dew:'owm'}},observations:{'sensor.t':{value:20,unit:'C',time:now,receivedAt:now}}}};}
test('screen conversion preserves HA source validation and converts temperature differences without an offset',()=>{
 const state=haState(),before=JSON.stringify(state),c=weatherReadings(state,now,{preferences:{temperatureUnit:'C'}}),f=weatherReadings(state,now,{preferences:{temperatureUnit:'F'}});
 assert.equal(c.temperature.text,'20.0°');assert.equal(f.temperature.text,'68.0°');assert.equal(f.temperature.value,20);assert.equal(f.temperature.canonicalValue,20);assert.equal(f.temperature.source,'ha');assert.equal(f.temperature.health,'ready');assert.equal(f.depression.text,'21.6°');assert.equal(c.depression.text,'12.0°');assert.equal(observationKey(c.temperature,state),observationKey(f.temperature,state));assert.equal(JSON.stringify(state),before);
 state.presentation.policy.sourceUnits={temperature:'F'};state.presentation.observations['sensor.t'].unit='F';state.presentation.observations['sensor.t'].value=68;
 assert.equal(weatherReadings(state,now,{preferences:{temperatureUnit:'C'}}).temperature.text,'20.0°');
 state.presentation.observations['sensor.t'].unit='C';assert.equal(weatherReadings(state,now,{preferences:{temperatureUnit:'F'}}).temperature.source,null);
});
test('Archive uses current display choices while preserving original source units and measurements',()=>{
 const state=haState();state.units={temperatureUnit:'F'};
 const rows=weatherReadings(state,now,{historical:true,preferences:{temperatureUnit:'C'}});assert.equal(rows.temperature.unit,'°C');assert.equal(rows.temperature.text,'20.0°');assert.equal(rows.temperature.observedUnit,'C');assert.equal(state.presentation.observations['sensor.t'].value,20);
});
test('wind, visibility and pressure convert through canonical units exactly once',()=>{
 for(const windUnit of ['mph','km/h','m/s','kn']){const a=readingValues(10,'wind','openweather','mph',{windUnit}),b=readingValues(a.displayValue,'wind','ha',windUnit,{windUnit:'mph'});assert.ok(Math.abs(b.displayValue-10)<1e-8);}
 assert.ok(Math.abs(readingValues(1,'visibility','ha','mi',{visibilityUnit:'km'}).displayValue-1.609344)<1e-9);
 const inches=readingValues(1012,'pressure','openweather','hPa',{pressureUnit:'inHg'}).displayValue;assert.ok(Math.abs(readingValues(inches,'pressure','ha','inHg',{pressureUnit:'hPa'}).displayValue-1012)<1e-8);
});
function samples(values,step=600000){return values.map((value,i)=>{const row={id:'temperature',source:'openweather',expected:'openweather',observedUnit:'C',unit:'°C',value,canonicalValue:value,time:now-(values.length-1-i)*step,retained:false};return {at:row.time/1000,row,key:observationKey(row,{})};});}
test('one-hour regression follows overall movement, suppresses noise and rejects insufficient or future evidence',()=>{
 const up=samples([10,11,12,13,12.9]),row=up.at(-1).row;assert.equal(hourTrend(up,row,{},now),'↑');
 const down=samples([14,13,12,11,11.1]);assert.equal(hourTrend(down,down.at(-1).row,{},now),'↓');
 const flat=samples([10,10.01,9.99,10.01,10]);assert.equal(hourTrend(flat,flat.at(-1).row,{},now),'');
 const short=samples([10,11,12]);assert.equal(hourTrend(short,short.at(-1).row,{},now),'');
 const duplicate=Array(5).fill(up.at(-1));assert.equal(hourTrend(duplicate,row,{},now),'');
 assert.equal(hourTrend([...up,...samples([100]).map(p=>({...p,at:(now+600000)/1000,row:{...p.row,time:now+600000}}))],row,{},now),'↑');
 const fahrenheit={...row,displayValue:55.22,unit:'°F'};assert.equal(hourTrend(up,fahrenheit,{},now),'↑');
});
test('one-hour trends do not cross a missing reading, source/unit boundary or a substantial gap',()=>{
 const up=samples([10,11,12,13,14]);up[2]={...up[2],row:{...up[2].row,value:null,canonicalValue:null,source:null}};assert.equal(hourTrend(up,up.at(-1).row,{},now),'');
 const changed=samples([10,11,12,13,14]);changed[2].key='old-source';assert.equal(hourTrend(changed,changed.at(-1).row,{},now),'');
 const missing=samples([10,11,12,13,14]);missing[2].row={...missing[2].row,time:null,source:null,value:null,canonicalValue:null};assert.equal(hourTrend(missing,missing.at(-1).row,{},now),'');
 const reset=samples([10,11,12,0,1]).map(p=>{const row={...p.row,id:'rainAccumulation',source:'ha',observedUnit:'mm',unit:'mm'};return {...p,row,key:observationKey(row,{})};});assert.equal(hourTrend(reset,reset.at(-1).row,{},now),'');
 const gaps=samples([10,11,12,13],1800000);assert.equal(hourTrend(gaps,gaps.at(-1).row,{},now),'');
 const derived=samples([10,11,12,13],1200000).map(p=>{const row={...p.row,id:'depression',source:'derived',inputs:[{...p.row,source:'ha'}]};return {...p,row,key:observationKey(row,{})};});assert.equal(hourTrend(derived,derived.at(-1).row,{},now),'');
 assert.deepEqual(trendWindow(1000,87400,2,true),{start:1000,end:87400});assert.deepEqual(trendWindow(1000,87400,2,false),{start:80200,end:87400});
});
test('global display endpoint is protected, same-origin and bounded',async t=>{
 const f=await settings(t);await setPin(f.directory,'123456');const auth=createSettingsAuth(f.directory),handler=settingsRoutes(auth,null,null,{displaySettings:f.settings});
 const server=createServer(async(req,res)=>handler(req,res,new URL(req.url,'http://localhost').pathname));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}/api/settings/display`;assert.equal((await fetch(url)).status,401);const {token}=await auth.unlock('123456'),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{}'})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers,body:'x'.repeat(1025)})).status,413);
 assert.equal((await fetch(url,{method:'POST',headers,body:'{"values":{"temperatureUnit":"C"}}'})).status,200);
});
test('changing display defaults cannot revise collection policy or HA source expectations',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'radar-display-policy-test-'));let store;t.after(async()=>{await store?.close();await rm(directory,{recursive:true,force:true});});
 store=await createHistoryStore(directory);const policy=await createWeatherSettings(store,{owmEnabled:true});await policy.initialize({temperatureUnit:'F'});
 assert.equal((await policy.configure({haCollect:true,mappings:{temperature:'sensor.t'},sourceUnits:{temperature:'F'}})).status,200);
 const before=policy.current(),display=await createDisplaySettings(directory,before.units);await display.configure({values:{temperatureUnit:'C',sunMode:'position'}});
 assert.deepEqual(policy.current(),before);assert.equal((await store.weatherState('policy')).revision,before.revision);assert.equal(before.sourceUnits.temperature,'F');
});
