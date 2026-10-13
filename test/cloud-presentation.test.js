import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCloudGroups} from '../scripts/dev-cloud-layers-model.js';
import {cloudPresentation} from '../public/cloud-layers-render.js';
import {cloudFooter} from '../public/cloud-layers-model.js';
const settings={width:200,height:70,font:100,units:'m',scale:0,cloudOpacity:85,cloudSize:100,texture:100,seed:7,vvStyle:'haze',convectiveShading:true,dataState:'fresh'};
const draw=(code,extra={})=>cloudPresentation(parseCloudGroups(code),{...settings,...extra});
test('all five clear/no-significant-cloud states have empty charts',()=>{for(const c of ['CAVOK','SKC','CLR','NSC','NCD']){const v=draw(c);assert.equal(v.message,'');assert.doesNotMatch(v.svg,/data-cloud-type|vv-haze/);}});
test('unknown heights never become ground layers; known heights still draw',()=>{assert.equal(draw('BKN///').message,'Cloud base unavailable');assert.doesNotMatch(draw('BKN///').svg,/data-cloud-type/);assert.match(draw('SCT/// BKN020').svg,/data-cloud-type/);});
test('VV zero has a marker; unknown VV has haze without a invented height',()=>{assert.match(draw('VV000').svg,/vv-marker/);assert.match(draw('VV///').svg,/vv-haze/);assert.doesNotMatch(draw('VV///').svg,/vv-marker/);assert.equal(draw('VV///').message,'Sky obscured\nVV unknown');assert.equal(draw('VV010',{scale:100}).clipped,1);});
test('retained reports draw on stale/error, expired and missing clear the plot',()=>{
 for(const dataState of ['stale','error'])assert.match(draw('BKN020',{dataState}).svg,/data-cloud-type/);
 for(const dataState of ['expired','unavailable','not-configured'])assert.doesNotMatch(draw('BKN020',{dataState}).svg,/data-cloud-type/);
 assert.equal(draw('BKN020',{dataState:'expired'}).message,'METAR expired');
});
test('LED priority: configuration, error, age, availability',()=>{
 const report=parseCloudGroups(''),ctx={station:'EGBB',timestamp:'131020Z'};
 for(const [dataState,health]of [['error','error'],['stale','warning'],['expired','warning'],['unavailable','neutral'],['not-configured','neutral']])assert.equal(cloudFooter(report,{...ctx,dataState}).health,health);
 assert.equal(cloudFooter(report,{...ctx,station:'',dataState:'error'}).health,'neutral');
});
test('CB/TCU cues share the exact coverage silhouette with ordinary BKN',()=>{
 const paths=c=>[...draw(c).svg.matchAll(/<path d="([^"]+)"/g)].map(m=>m[1]);const normal=paths('BKN025');
 for(const type of ['CB','TCU']){const p=paths('BKN025'+type);assert.deepEqual(p.slice(0,normal.length),normal);assert.match(draw('BKN025'+type).svg,/cloud-type-shading/);}
});
