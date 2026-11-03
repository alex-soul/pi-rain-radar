import test from 'node:test';
import assert from 'node:assert/strict';
import {grassLabFixture} from '../scripts/dev-grass-lab.mjs';
import {replayGrass} from '../public/grass-replay.js';
import {grassFactors,effectBins,effectOpacity} from '../scripts/dev-grass-effects.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('contribution tracing preserves exact replay values and accounts for each model step',()=>{
 const data=grassLabFixture(1793650000000),before=structuredClone(data);
 const traced=replayGrass(data.samples,null,null,{trace:true});
 assert.deepEqual(traced.map(({effects,...point})=>point),data.recorded);
 assert.deepEqual(data,before);assert.equal(traced[0].effects,null);
 for(const {effects:e}of traced){if(!e)continue;const hours=(e.end-e.start)/3600000;
  close((e.rates.rain+e.rates.dew)*hours,e.wetting);
  close((e.rates.solar+e.rates.wind+e.rates.air+e.rates.drainage)*hours,e.drying);
  close(e.after,Math.max(0,Math.min(5,e.before+e.wetting-e.drying)));
 }
 assert.ok(traced.some(p=>p.effects?.rates.solar>0));
 assert.ok(traced.some(p=>p.effects?.rates.solar===0));
 assert.ok(traced.some(p=>p.effects?.rates.rain>0));
 const windOff=replayGrass(data.samples,{...data.parameters,wind:0},null,{trace:true});
 assert.ok(windOff.filter(p=>p.effects).every(p=>p.effects.rates.wind===0));
 const scaled=replayGrass(data.samples,{...data.parameters,sensitivity:2},null,{trace:true});
 assert.deepEqual(scaled.map(p=>p.effects),traced.map(p=>p.effects),'sensitivity changes display only');
});
test('contributions use actual acquisition intervals and do not invent updates at repeats or resets',()=>{
 const data=grassLabFixture(1793650000000),samples=structuredClone(data.samples.slice(0,5));
 samples[2].snapshot=structuredClone(samples[1].snapshot); // repeated acquisition
 samples[3].snapshot.rows.wind.source=null; // unavailable, no advance
 const points=replayGrass(samples,null,null,{trace:true});
 assert.equal(points[2].effects,null);assert.equal(points[3].effects,null);
 assert.equal(points[4].effects,null,'15-minute gap reinitializes instead of fabricating contributions');
 const reset=structuredClone(data.samples.slice(0,3));reset[2].snapshot.rows.wind.entity='changed';
 assert.equal(replayGrass(reset,null,null,{trace:true})[2].effects,null);
 const saturate=structuredClone(data.samples.slice(0,2));saturate[1].snapshot.observedRain.value=100;
 const effect=replayGrass(saturate,null,null,{trace:true})[1].effects;
 assert.equal(effect.after,5);assert.ok(effect.wetting>100,'pre-clamp pressure stays visible');
 const bridge=structuredClone(data.samples.slice(0,2));bridge[0].snapshot.observedRain.value=10;
 Object.assign(bridge[1].snapshot.observedRain,{value:.2,resetAt:bridge[1].time,previousPeriod:10.1});
 const bridged=replayGrass(bridge,null,null,{trace:true})[1].effects;
 close(bridged.rates.rain,5.4);
 delete bridge[1].snapshot.observedRain.previousPeriod;
 assert.equal(replayGrass(bridge,null,null,{trace:true})[1].effects,null,'unbridgeable rain reset has no contribution');
});
test('heatmap buckets preserve duration, crop edges, distinguish missing/zero and share a fixed scale',()=>{
 const rates=value=>Object.fromEntries(grassFactors.map(f=>[f.key,value]));
 const points=[{effects:{start:0,end:10,rates:rates(1)}},{effects:null},{effects:{start:10,end:30,rates:rates(2)}},{effects:{start:40,end:50,rates:rates(0)}}];
 const bins=effectBins(points,0,60,3);
 close(bins[0].rates.rain,1.5);close(bins[0].coverage,1);
 close(bins[1].rates.wind,2);close(bins[1].coverage,.5);
 close(bins[2].rates.dew,0);close(bins[2].coverage,.5);
 assert.equal(effectBins(points,60,70,1)[0].rates.rain,null);
 close(effectBins(points,5,15,1)[0].rates.rain,1.5);
 assert.equal(effectOpacity(0),0);assert.equal(effectOpacity(2),1);assert.equal(effectOpacity(20),1);
 assert.equal(effectOpacity(null),0);assert.ok(effectOpacity(.2)<effectOpacity(.8));
});
