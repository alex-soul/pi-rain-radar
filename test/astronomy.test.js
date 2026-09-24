import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAstronomy,bearing} from '../public/astronomy-model.js';
import {getMoonPosition} from '../public/suncalc.js';
const at=createAstronomy(52.40801,-1.51041),t=Date.parse('2026-09-24T12:00Z');
test('local Sun times, rise/set endpoints and below-horizon state',()=>{
 const d=at(t);assert.equal(d.sun.up,true);assert.ok(d.sun.progress>.45&&d.sun.progress<.55);
 assert.ok(d.sun.rise<d.sun.transit&&d.sun.transit<d.sun.set);
 assert.equal(at(d.sun.rise-1000).sun.up,false);assert.equal(at(d.sun.set+1000).sun.up,false);
 assert.ok(at(d.sun.rise+1000).sun.progress<.001);assert.ok(at(d.sun.set-1000).sun.progress>.999);
 // Coventry equinox: solar noon is near noon UTC, not noon BST.
 assert.ok(Math.abs(d.sun.transit-t)<10*60000);
});
test('Moon interval crosses midnight, highest point is bracketed and replay is deterministic',()=>{
 const d=at(t),mid=(d.moon.rise+d.moon.set)/2,m=at(mid).moon;
 assert.equal(m.up,true);assert.ok(m.transit>m.rise&&m.transit<m.set);
 const alt=x=>getMoonPosition(new Date(x),52.40801,-1.51041).altitude;
 assert.ok(alt(m.transit)>=alt(m.transit-60000));assert.ok(alt(m.transit)>=alt(m.transit+60000));
 at(t+10*86400000);assert.deepEqual(at(t),d);
});
test('polar day/night do not invent rises or produce invalid progress',()=>{
 const polar=createAstronomy(80,20),summer=polar(Date.parse('2026-06-21T12:00Z')),winter=polar(Date.parse('2026-12-21T12:00Z'));
 assert.equal(summer.sun.up,true);assert.equal(summer.sun.continuous,true);assert.equal(summer.sun.rise,null);
 assert.equal(winter.sun.up,false);assert.equal(winter.sun.set,null);
 for(const d of [summer,winter])for(const id of ['sun','moon'])assert.ok(Number.isFinite(d[id].progress));
});
test('DST is presentation only, phase is bounded and bearings use north',()=>{
 for(const date of ['2026-03-29T00:30Z','2026-03-29T01:30Z','2026-10-25T00:30Z','2026-10-25T01:30Z']){
 const d=at(Date.parse(date));assert.ok(d.moon.illumination.fraction>=0&&d.moon.illumination.fraction<=1);
 assert.ok(d.sun.next.time>d.time);
 }
 const clock=t=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
 assert.equal(clock('2026-03-29T00:30Z'),'00:30');assert.equal(clock('2026-03-29T01:30Z'),'02:30');
 assert.equal(bearing(0),'N');assert.equal(bearing(90),'E');assert.equal(bearing(180),'S');
 assert.equal(createAstronomy(NaN,0)(t),null);
});
test('bundled SunCalc source and license match the pinned installed package',async()=>{
 for(const [publicName,packageName]of [['suncalc.js','index.js'],['suncalc-license.txt','LICENSE']])assert.deepEqual(await readFile(new URL('../public/'+publicName,import.meta.url)),await readFile(new URL('../node_modules/suncalc/'+packageName,import.meta.url)));
});
