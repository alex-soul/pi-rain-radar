import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {applyForecastRecording} from '../scripts/dev-forecast-recording.mjs';

const source=(await readFile(new URL('../public/history-weather-ui.js',import.meta.url),'utf8')).replace(/^import [^\n]*\n/,'').replaceAll('export function','function');
function render(pairs){
  const make=()=>({attributes:{},children:[],style:{},setAttribute(k,v){this.attributes[k]=v;},append(n){this.children.push(n);},replaceChildren(...n){this.children=n;}});
  const nodes=new Map(),axes=Array.from({length:5},make);
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);},createElementNS(ns,tag){return {...make(),tag};},querySelectorAll(){return axes;}};
  const context=vm.createContext({document,formatTime:t=>String(t),replay:{comparison:()=>pairs}});
  vm.runInContext(source+'\npaintHistoricalForecast(replay,7200,30,"UTC");',context);
  return {nodes,marks:nodes.get('minute-bars').children,axes};
}
test('comparison renders timestamp-spaced thin samples and breaks lines over collection gaps',()=>{
  const {marks,nodes,axes}=render([{time:60,now:1,predicted:.5,predictedAt:-1740},{time:660,now:0,predicted:1,predictedAt:-1140},{time:1560,now:0,predicted:1,predictedAt:-240}]);
  const bars=marks.filter(n=>n.tag==='rect');
  assert.equal(bars.length,3);assert.ok(bars.every(n=>n.attributes.width==='4'));
  const distances=bars.slice(1).map((n,i)=>Number(n.attributes.x)-Number(bars[i].attributes.x));
  assert.ok(Math.abs(distances[1]/distances[0]-1.5)<.0001,'irregular timing must not be evenly spaced');
  assert.equal(marks.filter(n=>n.tag==='line'&&n.attributes.stroke==='var(--forecast-comparison)').length,1);
  assert.ok(marks.some(n=>n.attributes['stroke-dasharray']==='2 4'&&n.attributes.stroke==='currentColor'));
  assert.equal(nodes.get('forecast-caption').hidden,false);assert.equal(axes[0].textContent,'0');assert.equal(axes[4].textContent,'7200');
});
test('empty comparison shows a neutral unsampled interval without fabricated dry samples',()=>{
  const {marks}=render([]);assert.equal(marks.filter(n=>n.tag==='rect'||n.tag==='circle').length,0);
  assert.equal(marks.filter(n=>n.attributes['stroke-dasharray']==='2 4').length,1);
});
test('recorded preview replaces synthetic forecasts without shifting time or filling gaps',()=>{
  const recording={forecasts:[{time:100,points:[]},{time:700,points:[]},{time:1300,points:[]}]};
  const data={weatherHistory:{start:200,end:1000,forecasts:[{time:800,points:[{precipitation:99}]}]}};
  const result=applyForecastRecording(data,recording);
  assert.deepEqual(result.weatherHistory.forecasts,[recording.forecasts[1]]);
  assert.equal(data.weatherHistory.forecasts[0].time,800);
});
