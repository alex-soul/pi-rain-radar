import test from 'node:test';
import assert from 'node:assert/strict';
import {layerPreferences} from '../public/layer-preferences.js';
test('legacy shared opacity and hidden clouds migrate to both maps without linking subsequent edits',()=>{
 const p=layerPreferences(null,{rain:45,cloud:37},false);
 assert.deepEqual(p.main,p.overview);assert.equal(p.main.cloud.visible,false);assert.equal(p.main.rain.opacity,45);
 p.main.cloud.opacity=90;p.main.rain.visible=false;assert.equal(p.overview.cloud.opacity,37);assert.equal(p.overview.rain.visible,true);
 assert.deepEqual(layerPreferences(p),p);
});
test('invalid per-map values fall back safely and opacity remains bounded',()=>{
 const p=layerPreferences({main:{rain:{opacity:200,visible:'no'},cloud:{opacity:-1}}},{rain:55,cloud:65});
 assert.equal(p.main.rain.opacity,100);assert.equal(p.main.rain.visible,true);assert.equal(p.main.cloud.opacity,0);assert.equal(p.overview.rain.opacity,55);
});
