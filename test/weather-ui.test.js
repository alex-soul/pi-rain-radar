import * as format from '../public/weather-format.js';
import * as readings from '../public/weather-readings.js';
import {formatTime} from '../public/time.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=(await readFile(new URL('../public/weather.js',import.meta.url),'utf8')).replaceAll('export ','').replace(/^import .*;\r?\n/gm,'');
const now=1789383600000;
const forecast=()=>Array.from({length:60},(_,i)=>({time:now/1000+i*60,precipitation:0}));
const state=()=>({configured:true,fetchedAt:now,forecastFetchedAt:now,failures:0,data:{current:{time:now/1000,temperature:14,feelsLike:12,windMph:9,gustMph:20,humidity:0,dewPoint:0,windDirection:359,visibility:0,pressure:1013,uvi:0},minutely:forecast()}});
function fixture(zone='Europe/London') {
  const nodes=new Map();let writes=0,minutes=60;
  const prefs={temperatureUnit:'C',windUnit:'mph',visibilityUnit:'km',pressureUnit:'hPa',directionFormat:'compass',directionConvention:'flow'};
  function node(){return {attributes:{},children:[],style:{},setAttribute(k,v){writes++;this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},getAttribute(){return 'true';},closest(){return this;},append(n){this.children.push(n);},replaceChildren(...children){writes++;this.children=children;}};}
  const document={querySelectorAll:()=>[],querySelector:()=>({content:zone}),getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElementNS:node};
  const c=vm.createContext({...format,...readings,document,formatTime,weatherPreferences:()=>prefs,gustCacheMinutes:()=>minutes});vm.runInContext(code,c);
  return {nodes,prefs,paint:c.paintWeather,writes:()=>writes,setMinutes:v=>minutes=v};
}
test('Rain forecast uses baselines for zero and missing minutes, and replaces failed or expired charts with a red baseline',()=>{
  const f=fixture(),s=state();f.paint(s,now);
  const bars=()=>f.nodes.get('minute-bars').children;
  assert.equal(bars().length,60);assert.ok(bars().every(b=>b.attributes.height===1&&b.attributes.width===6&&b.attributes.fill==='#75c8bd'));
  assert.equal(f.nodes.get('weather-dock').attributes['data-health'],'ready');
  assert.equal(f.nodes.get('settings-api-status').textContent,'Weather readings available');
  const gap={...s,forecastFetchedAt:now+1,data:{...s.data,minutely:s.data.minutely.filter((_,i)=>i!==5)}};f.paint(gap,now);
  assert.equal(bars().length,60);assert.equal(bars()[5].attributes.fill,'#c49343');assert.equal(f.nodes.get('weather-dock').attributes['data-health'],'ready');
  assert.equal(f.nodes.get('settings-api-status').textContent,'Weather readings available');
  f.paint({...s,forecastError:'Forecast failed'},now);
  assert.equal(f.nodes.get('settings-api-status').textContent,'Weather readings available');
  assert.equal(f.nodes.get('settings-api-status').attributes['data-health'],'ready');
  f.paint({...s,forecastFetchedAt:now+2,data:{...s.data,minutely:[]}},now);assert.equal(bars().length,1);assert.equal(bars()[0].attributes.fill,'#c27878');
  for(const failed of [{...s,forecastError:'Forecast failed'}, {...s,forecastFetchedAt:now-1800000}, {configured:false}, null]) {
    f.paint(failed,now);assert.equal(bars().length,1);assert.equal(bars()[0].attributes.width,360);assert.equal(bars()[0].attributes.fill,failed?.configured===false?'#89958f':'#c27878');assert.equal(f.nodes.get('minute-message').hidden,true);assert.equal(f.nodes.get('minute-message').textContent,'');
  }
  f.paint(s,now+600000);assert.equal(bars().filter(b=>b.attributes.fill==='#c49343').length,10);
  assert.equal(f.nodes.get('weather-dock').attributes['data-health'],'ready','natural horizon shrinkage does not imply a failed acquisition');
  f.paint({...s,data:{...s.data,minutely:s.data.minutely.map((m,i)=>({...m,precipitation:i===2?2:0}))},forecastFetchedAt:now+3},now);
  assert.equal(bars()[2].attributes.height,85);assert.equal(bars()[2].attributes.width,4);
});
test('all readings share tooltips, preserve zeros, rotate precisely and do not redraw on playback ticks',()=>{
  const f=fixture(),s=state();f.paint(s,now);
  assert.equal(f.nodes.get('weather-visibility').textContent,'0');assert.equal(f.nodes.get('weather-uv').textContent,'0');assert.equal(f.nodes.get('weather-humidity').textContent,'0%');
  for(const [id,name] of Object.entries(format.readingNames))assert.match(f.nodes.get('weather-'+id).title,new RegExp('^'+name+': .+ · OpenWeather · Observed 14 Sep 2026 12:00 · Acquired 14 Sep 2026 12:00$'));
  assert.equal(f.nodes.get('weather-temperature').title,'Temperature: 14.0 °C · OpenWeather · Observed 14 Sep 2026 12:00 · Acquired 14 Sep 2026 12:00');
  const before=f.writes();f.paint(s,now+1000);assert.equal(f.writes(),before);
  for(const convention of ['flow','meteorological'])for(const value of [0,0.1,45,179.9,180,245.25,359.9,360]) {
    f.prefs.directionConvention=convention;f.prefs.directionFormat='degrees';f.paint({...s,fetchedAt:now+value+1,data:{...s.data,current:{...s.data.current,windDirection:value}}},now);
    assert.equal(f.nodes.get('weather-direction-arrow').attributes.transform,`rotate(${format.windBearing(value,convention)} 14 14)`);
    assert.equal(f.nodes.get('weather-direction').textContent,format.windDirectionText(value,'degrees',convention));
  }
  f.prefs.visibilityUnit='mi';f.prefs.pressureUnit='inHg';f.paint({...s,fetchedAt:now+4,data:{...s.data,current:{...s.data.current,visibility:10000,windDirection:null}}},now);
  assert.equal(f.nodes.get('weather-visibility').textContent,'6.2+');assert.equal(f.nodes.get('weather-pressure').textContent,'29.91');assert.equal(f.nodes.get('weather-direction-arrow').attributes.visibility,'hidden');
  const ny=fixture('America/New_York');ny.paint(s,now);assert.equal(ny.nodes.get('weather-wind').title,'Wind: 9 mph · OpenWeather · Observed 14 Sep 2026 07:00 · Acquired 14 Sep 2026 07:00');
});
test('current values tolerate one failed poll while gust age and acquisition remain independent',()=>{
  const f=fixture(),s=state();s.gust={mph:0,time:now/1000-1800,fetchedAt:now-1700000};s.data.current.gustMph=null;
  f.paint(s,now);assert.equal(f.nodes.get('weather-gust').textContent,'0');assert.equal(f.nodes.get('weather-gust').attributes['data-cached'],'true');assert.match(f.nodes.get('weather-gust').title,/Acquired 14 Sep 2026 11:31 · Retained gust$/);
  f.paint({...s,error:'Current failed',failures:1},now+600000);assert.equal(f.nodes.get('weather-temperature').textContent,'14.0°');assert.equal(f.nodes.get('weather-temperature').attributes['data-cached'],'true');assert.equal(f.nodes.get('minute-bars').children.length,60);
  f.paint({...s,error:'Current failed',failures:2},now+1200000);assert.equal(f.nodes.get('weather-temperature').textContent,'—');assert.equal(f.nodes.get('weather-gust').textContent,'0');
  f.setMinutes(30);f.paint(s,now);assert.equal(f.nodes.get('weather-gust').textContent,'—');
  f.setMinutes(60);f.paint({...s,gust:{mph:0,time:s.gust.time}},now);assert.doesNotMatch(f.nodes.get('weather-gust').title,/Acquired/,'legacy acquisition time is not invented');
  f.paint(s,now+1800000);assert.equal(f.nodes.get('weather-gust').textContent,'—');assert.equal(f.nodes.get('weather-temperature').textContent,'—');
  f.paint(state(),now);assert.equal(f.nodes.get('weather-temperature').textContent,'14.0°');assert.equal(f.nodes.get('weather-dock').attributes['data-health'],'ready');
  f.paint({configured:false},now);for(const id of Object.keys(format.readingNames))assert.equal(f.nodes.get('weather-'+id).textContent,'—');
});

test('gust cache Off keeps current gusts but never retained fallback',()=>{
  const f=fixture(),s=state();f.setMinutes(0);s.gust={mph:35,time:now/1000-600,fetchedAt:now-600000};
  f.paint(s,now);assert.equal(f.nodes.get('weather-gust').textContent,'20');
  delete s.data.current.gustMph;s.fetchedAt++;f.paint(s,now);assert.equal(f.nodes.get('weather-gust').textContent,'—');
  s.data.current.gustMph=20;s.failures=1;f.paint(s,now);assert.equal(f.nodes.get('weather-gust').textContent,'—');
});

test('weather severity preserves one-poll grace, independent forecast failure, startup and recovery',()=>{
  const f=fixture(),s=state(),health=()=>f.nodes.get('weather-dock').attributes['data-health'];
  f.paint({configured:true,fetching:true},now);assert.equal(health(),'warning');
  assert.equal(f.nodes.get('minute-bars').children[0].attributes.fill,'#c49343');
  f.paint({...s,error:'Current failed',failures:1},now);assert.equal(health(),'warning');
  f.paint({...s,error:'Current failed',failures:2},now);assert.equal(health(),'error');
  assert.equal(f.nodes.get('weather-temperature').textContent,'—');
  assert.equal(f.nodes.get('minute-bars').children.length,60);
  f.paint({...s,forecastError:'Forecast failed'},now);assert.equal(health(),'ready');
  assert.equal(f.nodes.get('weather-temperature').textContent,'14.0°');
  assert.equal(f.nodes.get('minute-bars').children.length,1);
  f.paint(s,now+1800000);assert.equal(health(),'error');
  f.paint(null,now);assert.equal(health(),'error');
  f.paint({configured:false},now);assert.equal(health(),'unconfigured');
  f.paint(s,now);assert.equal(health(),'ready');
});

test('historical readings use selected-time freshness while health remains current',()=>{
  const f=fixture(),live=state(),clock=Date.now();live.fetchedAt=clock;live.data.current.time=clock/1000;
  const old=state();f.paint(old,now,{historical:true,operational:live});
  assert.equal(f.nodes.get('weather-temperature').textContent,'14.0°');
  assert.equal(f.nodes.get('settings-api-status').textContent,'Weather readings available');
  f.paint(old,now+1800000,{historical:true,operational:live});
  assert.equal(f.nodes.get('weather-temperature').textContent,'—');
  assert.equal(f.nodes.get('settings-api-status').textContent,'Weather readings available');
  f.paint({...old,data:{...old.data,current:{...old.data.current,time:now/1000+1}}},now,{historical:true,operational:live});
  assert.equal(f.nodes.get('weather-temperature').textContent,'—');
  f.paint(old,now,{historical:true,operational:{...live,failures:2,error:'Current outage'}});
  assert.equal(f.nodes.get('weather-temperature').textContent,'14.0°');
  assert.equal(f.nodes.get('weather-dock').attributes['data-health'],'error');
});
