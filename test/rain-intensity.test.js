import test from 'node:test';
import assert from 'node:assert/strict';
import {rainRateAtDbz,rainColour,rainGradientStops,createRainGradient} from '../public/rain-intensity.js';

test('rain colours follow absolute rate thresholds across independently scaled charts',()=>{
 for(const [dbz,colour] of [[15,'#88ddee'],[20,'#00a3e0'],[25,'#0077aa'],[30,'#005588'],[35,'#ffee00'],[40,'#ffaa00'],[45,'#ff4400'],[50,'#c10000']]){
  const rate=rainRateAtDbz(dbz);assert.equal(rainColour(rate),colour);
  for(const scale of [rate,rate*2,rate*10]){
   const stop=rainGradientStops(scale).find(s=>Math.abs(s.offset-rate/scale)<1e-12);
   assert.equal(stop.colour,colour);
  }
 }
 assert.notEqual(rainGradientStops(1).at(-1).colour,rainGradientStops(25).at(-1).colour);
 assert.equal(rainGradientStops(100).at(-1).colour,'#c10000');
 assert.equal(rainColour(0),'#88ddee');
});

test('gradient runs upwards in chart coordinates, not relative to individual bars',()=>{
 const document={createElementNS(ns,tag){return {tag,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(n){this.children.push(n);}};}};
 const [gradient]=createRainGradient(10,document).children;
 assert.equal(gradient.attrs.gradientUnits,'userSpaceOnUse');
 assert.equal(gradient.attrs.y1,85);assert.equal(gradient.attrs.y2,0);
 assert.equal(gradient.children[0].attrs['stop-color'],'#88ddee');
 assert.equal(gradient.children.at(-1).attrs['stop-color'],rainColour(10));
 assert.throws(()=>rainGradientStops(0));
});
