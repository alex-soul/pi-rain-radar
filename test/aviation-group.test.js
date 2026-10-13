import test from 'node:test';
import assert from 'node:assert/strict';
import {aviationGroup,changeAviation,groupVisible} from '../public/aviation-group-model.js';
const act=(s,type,extra={})=>changeAviation(s,{type,...extra}).state;
test('fresh screen is closed; first button click opens all selected panels',()=>{
 const s=aviationGroup();assert.equal(groupVisible(s),false);assert.deepEqual(act(s,'toggle').open,{metar:true,taf:true,clouds:true});
});
test('closing combined text leaves Clouds and does not change preferences',()=>{
 const s=act(act(aviationGroup(),'toggle'),'close',{panel:'text'});assert.deepEqual(s.open,{metar:false,taf:false,clouds:true});assert.deepEqual(s.selected,{metar:true,taf:true,clouds:true});
 assert.deepEqual(act(act(s,'toggle'),'toggle').open,s.selected);
});
test('sole METAR close survives reload and can reopen (Pi incident regression)',()=>{
 let s=aviationGroup({split:true,selected:{metar:true,taf:false,clouds:false}});s=act(act(s,'toggle'),'close',{panel:'metar'});
 s=aviationGroup(JSON.parse(JSON.stringify(s)));assert.equal(groupVisible(s),false);assert.equal(s.selected.metar,true);assert.deepEqual(act(s,'toggle').open,{metar:true,taf:false,clouds:false});
});
test('Clouds-only, synchronized selection and split preserve actual visibility',()=>{
 let s=aviationGroup({selected:{metar:false,taf:false,clouds:true}});s=act(s,'toggle');assert.deepEqual(s.open,{metar:false,taf:false,clouds:true});
 s=act(s,'select',{panel:'metar',value:true});assert.equal(s.open.metar,true);s=act(s,'close',{panel:'clouds'});s=act(s,'split',{value:true});assert.equal(s.open.clouds,false);assert.equal(s.selected.clouds,true);
 s=act(s,'select',{panel:'taf',value:true});assert.equal(s.open.taf,true);assert.equal(s.open.clouds,false);
});
test('all unselected opens picker and hidden changes only alter preferences',()=>{
 let s=aviationGroup({selected:{metar:false,taf:false,clouds:false}});assert.equal(changeAviation(s,{type:'toggle'}).picker,true);
 s=act(s,'select',{panel:'clouds',value:true});assert.equal(groupVisible(s),false);assert.equal(act(s,'toggle').open.clouds,true);
});
