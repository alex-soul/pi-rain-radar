import {trendRange,chartCredits} from '../public/weather-trends-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherSeries,readingTrend,chartSegments,trendsAt,gridInterval,smoothPath} from '../public/weather-trends-model.js';
import {weatherReadings} from '../public/weather-readings.js';
import {createWeatherReplay} from '../public/history-weather-model.js';
import {trendFixture} from '../scripts/dev-weather-trends.mjs';
const start=2000000,end=start+7200;
test('chart preserves missing samples and source changes; hidden Dock preferences do not remove series',()=>{
 const h=trendFixture({start,end}).weatherHistory,s=weatherSeries(h,{readings:[]});
 const lines=chartSegments(s.temperature,start,end,'°C');
 assert.ok(lines.length>=4);assert.ok(lines.some(l=>l.some(p=>p.source==='Home Assistant')));
 assert.ok(lines.every(l=>!l.some(p=>p.time>start+7200*.25&&p.time<start+7200*.45)));
 assert.ok(lines.every(l=>new Set(l.map(p=>p.source)).size===1));
 assert.ok(chartSegments(s.humidity,start,end,'%').length>=2);
});
test('arrows use previous distinct observation and suppress repeated, missing, retained and changed-source pairs',()=>{
 const p={key:'owm:C',row:{id:'temperature',source:'openweather',value:10,time:2000000}},c={key:'owm:C',row:{id:'temperature',source:'openweather',value:11,time:2300000}};
 assert.equal(readingTrend(p,c),'↑');assert.equal(readingTrend(c,{...c,row:{...c.row,value:9,time:2600000}}),'↓');
 for(const changed of [{...c,row:{...c.row,time:p.row.time}},{...c,key:'ha:C'},{...c,row:{...c.row,retained:true}},{...c,row:{...c.row,value:null}},{...c,row:{...c.row,id:'direction'}}])assert.equal(readingTrend(p,changed),'');
 assert.equal(readingTrend(p,{...c,row:{...c.row,time:5000000}}),'');
});
test('Archive arrows do not compare with later playback observations',()=>{
 const h=trendFixture({start,end}).weatherHistory,replay=createWeatherReplay(h),s=weatherSeries(h),time=start+600,state=replay.weather(time),rows=weatherReadings(state,time*1000,{historical:true});
 assert.equal(trendsAt(s,rows,state).temperature,'↑');
 const gap=start+2400,missing=replay.weather(gap);assert.equal(trendsAt(s,weatherReadings(missing,gap*1000,{historical:true}),missing).temperature,'');
});
test('Fahrenheit axis converts OWM exactly once and keeps HA already in chosen units',()=>{
 const points=[{at:1000,key:'owm:F',row:{id:'temperature',time:1000000,value:0,source:'openweather',unit:'°F'}},{at:1300,key:'ha:F',row:{id:'temperature',time:1300000,value:68,source:'ha',unit:'°F'}}];
 assert.deepEqual(chartSegments(points,900,1400,'°F').map(l=>l[0].value),[32,68]);assert.equal(chartSegments(points,900,1400,'°C').length,0);
});
test('disabled readings and policy changes break chart and arrow continuity',()=>{
 const h={weather:[{time:start,receivedAt:start*1000,current:{time:start,temperature:12}},{time:start+600,receivedAt:(start+600)*1000,current:{time:start+600,temperature:15}}],policies:[{time:start+300,initialized:true,units:{temperatureUnit:'C'},mappings:{temperature:'disabled'}}]};
 const s=weatherSeries(h);assert.equal(chartSegments(s.temperature,start,end,'°C').flat().length,1);
});

test('HA chart never connects across its ten-minute freshness limit',()=>{
 const row={id:'temperature',source:'ha',unit:'°C',value:12};
 const points=[{key:'ha',row:{...row,time:1000000}},{key:'ha',row:{...row,time:1900000}}];
 assert.equal(chartSegments(points,900,2000,'°C').length,2);
});

test('adaptive grid follows playback windows and becomes sparser in narrow widgets',()=>{
 for(const [h,minutes]of [[2,10],[4,30],[6,30],[12,60],[24,120]])assert.equal(gridInterval(h*3600,400),minutes*60);
 assert.ok(gridInterval(86400,180)>7200);assert.equal(86400%gridInterval(86400,180),0);
});
test('smooth paths keep extrema and do not create dots or bridge isolated samples',()=>{
 assert.equal(smoothPath([[1,2]]),'');
 const p=smoothPath([[0,0],[10,10],[20,0]]);assert.equal(p.split(' C').length,3);assert.match(p,/ 10,10 C/);assert.ok(!p.includes('NaN'));
 assert.ok(!smoothPath([[0,0],[0,1],[10,2]]).includes('NaN'));
});

test('wind chart converts OWM mph but preserves HA values in their recorded unit',()=>{
 const points=[{at:100,row:{id:'wind',source:'openweather',sourceLabel:'OpenWeather',time:100000,value:10,unit:'km/h'},key:'owm'},{at:200,row:{id:'wind',source:'ha',sourceLabel:'HA',time:200000,value:20,unit:'km/h'},key:'ha'}];
 const segments=chartSegments(points,0,300,'km/h');assert.equal(segments.length,2);assert.equal(segments[0][0].value,16.09344);assert.equal(segments[1][0].value,20);
});

test('trend ranges centre constants, tame near-constants and include negative extrema',()=>{
 for(const [values,id,unit] of [[[14,14],'temperature','°C'],[[1012,1012.01],'pressure','hPa'],[[0,0],'uv',''],[[-5,8],'temperature','°C']]){
  const [low,high]=trendRange(values,id,unit);assert.ok(low<Math.min(...values));assert.ok(high>Math.max(...values));assert.ok(Number.isFinite(high-low));
 }
 const [low,high]=trendRange([14,14],'temperature','°C');assert.equal((low+high)/2,14);assert.ok(high-low>=1);
 assert.deepEqual(trendRange([],'gust','mph'),[0,1]);
});
test('visibility and pressure convert OWM units while derived depression is already converted',()=>{
 const segment=(id,value,unit,source='openweather')=>chartSegments([{key:id,row:{id,value,unit,source,time:100000},at:100}],0,200,unit)[0][0].value;
 assert.equal(segment('visibility',5000,'km'),5);assert.equal(segment('visibility',15000,'km'),10);
 assert.ok(Math.abs(segment('pressure',1000,'inHg')-29.5299830714)<1e-9);
 assert.equal(segment('pressure',29.5,'inHg','ha'),29.5);assert.equal(segment('depression',9,'°F','derived'),9);
});

test('chart attribution follows enabled charts and both derived inputs',()=>{
 const owm={source:'openweather'},ha={source:'ha',expected:'ha',attribution:'Home Assistant'};
 const series={temperature:[{at:100,row:owm}],humidity:[{at:100,row:ha}],depression:[{at:100,row:{inputs:[owm,ha]}}]};
 assert.deepEqual(chartCredits(series,['temperature'],0,200),{openweather:true,other:''});
 assert.deepEqual(chartCredits(series,['humidity'],0,200),{openweather:false,other:'Home Assistant'});
 assert.deepEqual(chartCredits(series,['depression'],0,200),{openweather:true,other:'Home Assistant'});
 assert.deepEqual(chartCredits(series,[],0,200),{openweather:false,other:''});
 assert.deepEqual(chartCredits(series,['temperature'],101,200),{openweather:false,other:''});
});
