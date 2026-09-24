import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherReadings,weatherHealth,weatherProviderHealth,readingExplanation,readingSourceCaption} from '../public/weather-readings.js';
import {defaultUnits,weatherFields,selectHaReadings} from '../public/weather-policy.js';
import {createWeatherReplay} from '../public/history-weather-model.js';
const now=1789383600000;
function fixture(){return {configured:true,fetchedAt:now,failures:0,data:{current:{time:now/1000,temperature:14,feelsLike:12,windMph:9,gustMph:null,humidity:72,dewPoint:8,visibility:10000,pressure:1012,uvi:2,windDirection:245}},presentation:{policy:{source:'ha',owmCollect:true,haCollect:true,fallback:false,units:{...defaultUnits},mappings:{...Object.fromEntries(weatherFields.map(f=>[f,'owm'])),temperature:'sensor.t',feels:'sensor.f'}},observations:Object.fromEntries(['sensor.t','sensor.f'].map(entity=>[entity,{value:20,unit:'C',time:now,receivedAt:now,basis:'ha-reported'}]))}};}

test('partial HA assignments with optional missing OWM gust remain healthy for all ten readings',()=>{
  const state=fixture(),rows=weatherReadings(state,now);
  // The previous renderer used this predicate and incorrectly turned red.
  assert.equal(Object.values(selectHaReadings(state.presentation.policy,state.presentation.observations,state,now)).some(row=>!row.source),true);
  assert.equal(Object.keys(rows).length,11);assert.equal(rows.temperature.source,'ha');assert.equal(rows.wind.source,'openweather');
  assert.equal(rows.gust.text,'—');assert.equal(rows.gust.health,'ready');assert.equal(weatherHealth(rows).health,'ready');
  for(const field of ['temperature','feels','wind','gust']){
    const s=fixture();s.presentation.policy.mappings=Object.fromEntries(weatherFields.map(f=>[f,'owm']));s.presentation.policy.mappings[field]='sensor.single';
    s.presentation.observations={'sensor.single':{value:12,unit:['wind','gust'].includes(field)?'mph':'C',time:now,receivedAt:now}};
    assert.equal(weatherHealth(weatherReadings(s,now)).health,'ready');
  }
});
test('hidden enabled readings still report genuine failures; Disabled readings discard values and never fallback',()=>{
  const s=fixture();s.data.current.humidity=null;
  assert.equal(weatherHealth(weatherReadings(s,now,{preferences:{readings:['temperature']}})).health,'error');
  s.presentation.policy.mappings.humidity='disabled';s.presentation.policy.mappings.temperature='disabled';s.presentation.policy.fallback=true;
  const rows=weatherReadings(s,now);assert.equal(rows.temperature.value,null);assert.equal(rows.temperature.fallback,false);assert.equal(rows.temperature.sourceLabel,'Disabled');
  assert.equal(weatherHealth(rows).health,'ready');
});
test('retained OWM gust is amber until expiry, then an ordinary dash; HA gust never uses retained OWM cache',()=>{
  const s=fixture();s.gust={mph:30,time:now/1000-1200,fetchedAt:now-1100000};
  assert.equal(weatherReadings(s,now).gust.health,'warning');
  assert.equal(weatherReadings(s,now,{gustMinutes:15}).gust.health,'ready');
  s.presentation.policy.mappings.gust='sensor.g';s.presentation.policy.fallback=true;
  let row=weatherReadings(s,now).gust;assert.equal(row.value,null);assert.equal(row.health,'error');
  s.data.current.gustMph=15;row=weatherReadings(s,now).gust;assert.equal(row.value,15);assert.equal(row.fallback,true);
  s.failures=2;assert.equal(weatherReadings(s,now).gust.health,'error');
});
test('HA stale/unit mismatch and fallback carry accurate source, times and consistent explanations',()=>{
  const s=fixture();s.presentation.policy.fallback=true;s.presentation.observations['sensor.t'].time=now-600001;
  s.presentation.observations['sensor.f'].unit='F';const rows=weatherReadings(s,now);
  assert.equal(rows.temperature.fallback,true);assert.equal(rows.feels.fallback,true);assert.equal(rows.temperature.health,'warning');
  assert.equal(rows.temperature.sourceLabel,'OpenWeather fallback');assert.match(rows.feels.reason,/Unit mismatch/);
  for(const row of Object.values(rows)){const text=readingExplanation(row,()=> 'test time');assert.ok(text.startsWith(row.name+':'));assert.ok(text.includes(' · '));assert.ok(!text.includes('|'));}
  assert.match(readingExplanation(rows.temperature,()=> 'test time'),/Observed test time · Acquired test time/);
});
test('disabled historical intervals filter preceding raw and presentation samples without altering earlier history',()=>{
  const s=fixture(),old={time:now/1000,current:s.data.current,receivedAt:now};
  const policies=[{...s.presentation.policy,time:now/1000,initialized:true},{...s.presentation.policy,time:now/1000+60,initialized:true,mappings:{...s.presentation.policy.mappings,temperature:'disabled',humidity:'disabled'}}];
  const history={weather:[old],policies,presentations:[{time:now/1000,...s.presentation,owm:s}]};
  const replay=createWeatherReplay(history);
  assert.equal(weatherReadings(replay.weather(now/1000),now,{historical:true}).temperature.value,20);
  const later=weatherReadings(replay.weather(now/1000+60),now+60000,{historical:true});assert.equal(later.temperature.value,null);assert.equal(later.humidity.expected,'disabled');
  assert.equal(replay.weather(now/1000+60,true).data.current.temperature,undefined);assert.equal(old.current.temperature,14);
});
test('provider status separates failed HA from healthy OWM fallback and reports idle collectors',()=>{
  const state=fixture();state.presentation.observations={};state.presentation.policy.fallback=true;
  assert.equal(weatherProviderHealth(state,'ha',now).health,'error');
  assert.equal(weatherProviderHealth(state,'owm',now).health,'ready');
  assert.equal(weatherHealth(weatherReadings(state,now)).health,'warning');
  state.presentation.policy.owmCollect=false;
  assert.equal(weatherProviderHealth(state,'owm',now).summary,'Configured · Collection disabled');
});


test('all six additional HA readings validate units and format without double conversion',()=>{
 const s=fixture(),values={humidity:[63,'%'],dew:[7,'C'],direction:[270,'°'],visibility:[4.2,'mi'],pressure:[29.92,'inHg'],uv:[3,'index']};
 Object.assign(s.presentation.policy.units,{visibilityUnit:'mi',pressureUnit:'inHg'});
 for(const [id,[value,unit]] of Object.entries(values)){s.presentation.policy.mappings[id]='sensor.'+id;s.presentation.observations['sensor.'+id]={value,unit,time:now,receivedAt:now};}
 let rows=weatherReadings(s,now);
 for(const id of Object.keys(values))assert.equal(rows[id].source,'ha');
 assert.equal(rows.visibility.text,'4.2');assert.equal(rows.pressure.text,'29.92');
 s.presentation.observations['sensor.humidity'].value=101;assert.equal(weatherReadings(s,now).humidity.health,'error');
 s.presentation.observations['sensor.pressure'].unit='hPa';assert.match(weatherReadings(s,now).pressure.reason,/Unit mismatch/);
});
test('derived depression uses mixed configured sources in C/F and missing inputs stay missing',()=>{
 const s=fixture();let rows=weatherReadings(s,now,{preferences:{readings:['temperature','depression']}});
 assert.equal(rows.depression.value,12);assert.equal(rows.depression.text,'12.0°');
 s.presentation.policy.units.temperatureUnit='F';s.presentation.observations['sensor.t'].unit='F';s.presentation.observations['sensor.t'].value=68;
 assert.equal(weatherReadings(s,now).depression.text,'21.6°');
 s.presentation.policy.mappings.dew='disabled';assert.equal(weatherReadings(s,now).depression.value,null);
});
test('optional gust never changes aggregate health, required failures still do',()=>{
 const s=fixture();s.gust={mph:30,time:now/1000-1200,fetchedAt:now-1100000};
 assert.equal(weatherReadings(s,now).gust.health,'warning');assert.equal(weatherHealth(weatherReadings(s,now)).health,'ready');
 s.presentation.policy.mappings.gust='sensor.missing';assert.equal(weatherReadings(s,now).gust.health,'error');assert.equal(weatherHealth(weatherReadings(s,now)).health,'ready');
 s.data.current.windMph=null;assert.equal(weatherHealth(weatherReadings(s,now)).health,'error');
});


import {playbackSpeeds,lastFrameMultipliers,playbackFrameDelay} from '../public/weather-format.js';
test('playback speed and final-frame hold preserve intermediate speed and use 2.4 default',()=>{
 assert.deepEqual(playbackSpeeds.slice(0,4),[0.5,0.75,1,1.5]);assert.equal(playbackSpeeds.at(-1),10);
 assert.ok(lastFrameMultipliers.includes(2.4));assert.equal(lastFrameMultipliers[0],1);assert.equal(lastFrameMultipliers.at(-1),5);
 for(const speed of [0.5,0.75,1,10]){assert.equal(playbackFrameDelay(true,speed),1560/speed);assert.equal(playbackFrameDelay(true,speed,1),playbackFrameDelay(false,speed));assert.equal(playbackFrameDelay(true,speed,5),3250/speed);}
});


test('depression source caption reflects both actual inputs including fallback',()=>{
 const row={id:'depression',inputs:[{source:'openweather'},{source:'openweather'}]};
 assert.equal(readingSourceCaption(row),'OpenWeather');
 row.inputs[0].source='ha';assert.equal(readingSourceCaption(row),'OpenWeather/HA');
 row.inputs[1].source='ha';assert.equal(readingSourceCaption(row),'HA');
 row.inputs[0]={source:'openweather',expected:'ha',fallback:true};assert.equal(readingSourceCaption(row),'OpenWeather/HA');
});
