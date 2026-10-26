import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {applyForecastRecording} from '../scripts/dev-forecast-recording.mjs';
import {createWeatherReplay} from '../public/history-weather-model.js';
import {rainComparisonFixture} from '../scripts/dev-rain-comparison.mjs';
const source=(await readFile(new URL('../public/history-weather-ui.js',import.meta.url),'utf8')).replace(/^import [^\n]*\n/,'').replaceAll('export function','function');
function harness(replay,time){
 const make=()=>({attributes:{},children:[],style:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},append(...n){this.children.push(...n);},replaceChildren(...n){this.children=n;}});
 const nodes=new Map(),axes=Array.from({length:5},make);
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);},createElement(tag){return {...make(),tag};},createElementNS(ns,tag){return {...make(),tag};},querySelectorAll(){return axes;}};
 const context=vm.createContext({document,formatTime:t=>String(t),replay,time});vm.runInContext(source,context);
 return {nodes,axes,paint(on){vm.runInContext(`paintHistoricalForecast(replay,time,${on},"UTC")`,context);return nodes.get('minute-bars').children;}};
}
const end=1800000000,start=end-3600;
const forecasts=[{time:start,receivedAt:start*1000+90000,points:Array.from({length:61},(_,i)=>({time:start+i*60,precipitation:i%10/10}))}];
test('actual overlay preserves original bars, axes and scale through off/on/off, even above forecast',()=>{
 const data=rainComparisonFixture({weatherHistory:{context:'1,2',forecasts}},'rain-comparison',end);
 const h=harness(createWeatherReplay(data.weatherHistory),start);
 const off=JSON.stringify(h.paint(false)),axis=h.axes.map(n=>n.textContent),ceiling=h.nodes.get('minute-y-top').textContent;
 const on=h.paint(true);assert.equal(JSON.stringify(on.filter(n=>n.tag==='rect')),off);assert.equal(on.filter(n=>n.tag==='circle').length,12);
 assert.deepEqual(h.axes.map(n=>n.textContent),axis);assert.equal(h.nodes.get('minute-y-top').textContent,ceiling);assert.equal(ceiling,'10');assert.equal(h.nodes.get('minute-y-middle').textContent,'5');
 assert.match(h.nodes.get('minute-chart').attributes['aria-label'],/60 \/ 60 min covered/);
 assert.equal(on.filter(n=>n.tag==='path').length,1);
 assert.equal(JSON.stringify(h.paint(false)),off);
});
test('missing observations add no dry marks; reset and source gaps remain disconnected',()=>{
 for(const scenario of ['rain-boundaries','rain-unavailable']){
  const data=rainComparisonFixture({weatherHistory:{context:'1,2',forecasts}},scenario,end),h=harness(createWeatherReplay(data.weatherHistory),start);
  const before=JSON.stringify(h.paint(false)),after=h.paint(true);assert.equal(JSON.stringify(after.filter(n=>n.tag==='rect')),before);
  const lines=after.filter(n=>n.tag==='circle');assert.ok(lines.length<12);if(scenario==='rain-unavailable')assert.equal(lines.length,0);
  assert.match(h.nodes.get('minute-chart').attributes['aria-label'],scenario==='rain-unavailable'?/unavailable/:/gaps/);
 }
});
test('recorded preview replaces synthetic forecasts without shifting time or filling gaps',()=>{
  const recording={forecasts:[{time:100,points:[]},{time:700,points:[]},{time:1300,points:[]}]};
  const data={weatherHistory:{start:200,end:1000,forecasts:[{time:800,points:[{precipitation:99}]}]}};
  const result=applyForecastRecording(data,recording);
  assert.deepEqual(result.weatherHistory.forecasts,[recording.forecasts[1]]);
  assert.equal(data.weatherHistory.forecasts[0].time,800);
});

test('missing saved forecast is explicit even when observed rain exists',()=>{
 const data=rainComparisonFixture({weatherHistory:{context:'1,2',forecasts:[]}},'rain-comparison',end),h=harness(createWeatherReplay(data.weatherHistory),start);
 assert.equal(h.paint(true).filter(n=>n.tag==='circle').length,0);
 assert.match(h.nodes.get('minute-chart').attributes['aria-label'],/Forecast · no saved data/);
 assert.match(h.nodes.get('minute-chart').attributes['aria-label'],/No saved forecast to compare/);
});

test('smoothed rain connects midpoint dots with bounded controls and breaks across missing intervals',()=>{
 const intervals=[{start,end:start+300,rate:0},{start:start+300,end:start+600,rate:10},{start:start+600,end:start+900,rate:2},{start:start+1200,end:start+1500,rate:5},{start:start+1500,end:start+1800,rate:1},{start:start+2100,end:start+2400,rate:4}].map(p=>({...p,reportedAt:p.end*1000}));
 const snapshot={...forecasts[0],pointMap:new Map(forecasts[0].points.map(p=>[p.time,p.precipitation]))};
 const h=harness({forecast:()=>snapshot,actualRain:()=>({intervals,seconds:1800,span:3600,reasons:['missing interval']})},start),nodes=h.paint(true);
 const dots=nodes.filter(n=>n.tag==='circle'),paths=nodes.filter(n=>n.tag==='path');
 assert.equal(dots.length,6);assert.equal(paths.length,2);
 intervals.forEach((p,i)=>{assert.ok(Math.abs(Number(dots[i].attributes.cx)-(((p.start+p.end)/2-start)/60+.5)*360/61)<1e-10);assert.equal(Number(dots[i].attributes.cy),85-p.rate/10*85);});
 for(const [i,indices] of [[0,[0,1,2]],[1,[3,4]]]){
  const tokens=paths[i].attributes.d.split(' ');assert.equal(tokens.shift(),'M');
  let x=Number(tokens.shift()),y=Number(tokens.shift());assert.equal(x,Number(dots[indices[0]].attributes.cx));
  for(const index of indices.slice(1)){
   assert.equal(tokens.shift(),'C');const [x1,y1,x2,y2,nx,ny]=tokens.splice(0,6).map(Number);
   assert.ok(y1>=Math.min(y,ny)&&y1<=Math.max(y,ny));assert.ok(y2>=Math.min(y,ny)&&y2<=Math.max(y,ny));assert.ok(x1>x&&x2<nx&&x1<x2);
   assert.equal(nx,Number(dots[index].attributes.cx));assert.equal(ny,Number(dots[index].attributes.cy));x=nx;y=ny;
  }
  assert.equal(tokens.length,0);
 }
});

test('rain curve flows through rising and falling points without steps or overshooting',()=>{
 const context=vm.createContext({document:{getElementById(){}},formatTime(){}});vm.runInContext(source,context);
 const points=[{x:0,y:85},{x:10,y:80},{x:30,y:60},{x:60,y:10},{x:75,y:40},{x:90,y:80},{x:110,y:85},{x:120,y:85}];
 const tokens=context.smoothRainPath(points).split(' ').slice(3);let previousSlope=null;
 for(let i=1;i<points.length;i++){
  assert.equal(tokens.shift(),'C');const [x1,y1,x2,y2,x,y]=tokens.splice(0,6).map(Number),a=points[i-1],b=points[i];
  assert.equal(x,b.x);assert.equal(y,b.y);
  const incoming=(y1-a.y)/(x1-a.x),outgoing=(b.y-y2)/(b.x-x2);
  if(previousSlope!==null)assert.ok(Math.abs(incoming-previousSlope)<1e-10,'shared tangent at each dot');
  if(i===2||i===3)assert.ok(incoming<0,'rising rain must not flatten at intermediate dots');
  if(i===5||i===6)assert.ok(incoming>0,'falling rain must not flatten at intermediate dots');
  for(let step=0;step<=100;step++){
   const t=step/100,v=(1-t)**3*a.y+3*(1-t)**2*t*y1+3*(1-t)*t*t*y2+t**3*b.y;
   assert.ok(v>=Math.min(a.y,b.y)-1e-10&&v<=Math.max(a.y,b.y)+1e-10,'curve stays between measured values');
  }
  previousSlope=outgoing;
 }
});
