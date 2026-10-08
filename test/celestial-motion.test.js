import test from 'node:test';
import assert from 'node:assert/strict';
import {celestialPosition,lunarLowerLimb} from '../public/celestial-motion.js';
import {createAstronomy} from '../public/astronomy-model.js';
import {getMoonPosition} from '../public/suncalc.js';

test('both bodies hit all five limb/transit anchors at actual resized disc geometry',()=>{
 const at=createAstronomy(52.40801,-1.51041),data=at(Date.parse('2026-10-08T12:00Z'));
 for(const name of ['sun','moon']){
  const e=data[name];assert.ok(e.rise<e.riseEnd&&e.riseEnd<e.transit&&e.transit<e.setStart&&e.setStart<e.set,name);
  for(const [w,r]of [[200,14],[420,28],[95,15]]){
   const x=t=>celestialPosition(t,e,w,r);
   for(const [key,expected]of [['rise',-r],['riseEnd',r],['transit',w/2],['setStart',w-r],['set',w+r]])assert.ok(Math.abs(x(e[key])-expected)<1e-7,`${name} ${key}`);
   let last=-r;
   for(let i=0;i<=10000;i++){const next=x(e.rise+(e.set-e.rise)*i/10000);assert.ok(next>=last-1e-8&&next<=w+r);last=next;}
   for(const key of ['riseEnd','transit','setStart']){
    const t=e[key],before=x(t)-x(t-1),after=x(t+1)-x(t);assert.ok(Math.abs(before-after)<1e-6,`${name} smooth ${key}`);
   }
   assert.ok(x(e.transit+600000)-x(e.transit)>.5*Math.min((w/2-r)/(e.transit-e.riseEnd),(w/2-r)/(e.setStart-e.transit))*600000,`${name} advances through transit`);
   assert.ok(x(e.rise+1000)-x(e.rise)>x(e.transit+1000)-x(e.transit));
  }
 }
 for(const key of ['riseEnd','setStart'])assert.ok(Math.abs(lunarLowerLimb(getMoonPosition(new Date(data.moon[key]),52.40801,-1.51041)))<1e-5);
});

test('missing inner events and narrow lanes retain monotone finite fallback',()=>{
 const e={rise:0,transit:400,set:1000,riseEnd:null,setStart:null};
 for(const [w,r]of [[10,14],[500,14]]){
  let last=-r;for(let t=0;t<=1000;t++){const next=celestialPosition(t,e,w,r);assert.ok(Number.isFinite(next)&&next>=last-1e-8);last=next;}
 }
 assert.equal(celestialPosition(3,{rise:null,set:8},200,14),null);
});

test('cross-midnight trajectories remain stable when the daily cache changes',()=>{
 const at=createAstronomy(52.40801,-1.51041),midnight=Date.parse('2026-09-25T00:00Z');
 const a=at(midnight-1).moon,b=at(midnight+1).moon;
 assert.ok(a.up&&b.up);assert.equal(a.rise,b.rise);assert.equal(a.set,b.set);
 assert.ok(Math.abs(celestialPosition(midnight,a,300,15)-celestialPosition(midnight,b,300,15))<.001);
});
