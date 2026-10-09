import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherReadings,readingExplanation} from '../public/weather-readings.js';
import {weatherSeries,chartSegments,readingTrend,observationKey,trendRange} from '../public/weather-trends-model.js';
import {createWeatherReplay} from '../public/history-weather-model.js';

const start=1791504000,entity='sensor.rain';
function snapshot(time,value,{unit='mm',resetAt=start*1000,sensor=entity}={}){
 return {time,policy:{haCollect:true,rainAccumulation:sensor,mappings:{},units:{}},owm:{configured:false},observations:{[sensor]:{value,unit,stateClass:'total_increasing',resetAt,time:time*1000,receivedAt:time*1000}}};
}
test('rain dock reading uses observed units, explains the running total and exposes gaps without forecasts',()=>{
 const sample=snapshot(start,2.75),state={presentation:sample};
 const row=weatherReadings(state,start*1000).rainAccumulation;
 assert.equal(row.text,'2.8');assert.equal(row.unit,'mm');assert.equal(row.source,'ha');assert.equal(row.health,'ready');
 assert.match(readingExplanation(row,()=> 'today'),/running total.*not rain intensity/);
 const stale=weatherReadings(state,(start+601)*1000).rainAccumulation;
 assert.equal(stale.value,null);assert.equal(stale.text,'—');assert.equal(stale.health,'error');
 for(const unit of ['cm','in'])assert.equal(weatherReadings({presentation:snapshot(start,0,{unit})},start*1000).rainAccumulation.unit,unit);
 assert.equal(weatherReadings({},start*1000).rainAccumulation.expected,'disabled');
 assert.equal(weatherReadings({presentation:snapshot(start,4,{unit:'mm/h'})},start*1000).rainAccumulation.value,null);
});
test('rain history retains dry plateaus and breaks on gaps, resets, sensor changes and implicit decreases',()=>{
 const presentations=[snapshot(start,0),snapshot(start+300,0),snapshot(start+600,1.5),snapshot(start+900,null),snapshot(start+1200,2),snapshot(start+1500,0,{resetAt:(start+1500)*1000}),snapshot(start+1800,.5,{resetAt:(start+1500)*1000}),snapshot(start+2100,.75,{sensor:'sensor.other'}),snapshot(start+2400,.25,{sensor:'sensor.other'})];
 const history={presentations},series=weatherSeries(history).rainAccumulation;
 assert.deepEqual(chartSegments(series,start,start+2400,'mm').map(line=>line.map(p=>p.value)),[[0,0,1.5],[2],[0,.5],[.75],[.25]]);
 assert.equal(readingTrend(series[0],series[1]),'');assert.equal(readingTrend(series[1],series[2]),'↑');
 assert.equal(readingTrend(series[4],series[5]),'');assert.equal(readingTrend(series[7],series[8]),'');
 const replay=createWeatherReplay(history),at=start+599;
 assert.equal(weatherReadings(replay.weather(at),at*1000,{historical:true}).rainAccumulation.value,0);
 assert.notEqual(observationKey(series[4].row),observationKey(series[5].row));
 assert.equal(trendRange([0,0], 'rainAccumulation','mm')[0],0);
});
