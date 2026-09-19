import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {localRainbowCounts} from '../src/stats.js';
import {statsSnapshot} from '../public/stats-format.js';

test('public Rainbow summary is a strict allowlist, not provider configuration or lifetime allowance',()=>{
  assert.deepEqual(localRainbowCounts({month:'2026-09',requests:42,tiles:40,total:500,testRequestLimit:999,apiKey:'secret'}),{month:'2026-09',requests:42,tiles:40});
  assert.equal(localRainbowCounts({month:'2026-09',requests:-1,tiles:40}),null);
  assert.equal(localRainbowCounts(null),null);
});
test('Archive completeness stays separate from current acquisition; stale values are marked',()=>{
  const status={sources:{main:{time:1234}},counts:{main:{available:13,missing:0}},end:1234,serverTime:100000};
  const selected={hours:24,end:600,counts:{main:{available:140,missing:5}}};
  const input={status,selected,hours:2,receivedAt:200000,reachable:true};
  const s=statsSnapshot(input,201000);
  assert.equal(s.sources.main.time,1234);assert.equal(s.counts.main.missing,5);assert.equal(s.end,600);assert.match(s.windowLabel,/Archive · 24 h/);assert.equal(s.stale,false);
  assert.equal(statsSnapshot(input,246000).stale,true);
  assert.equal(statsSnapshot({...input,reachable:false},201000).stale,true);
  assert.equal(statsSnapshot({...input,selected:null},201000).counts.main.available,13);
});
test('new Stats control preserves existing order and visibility, and is hidden by default',async()=>{
  const source=(await readFile(new URL('../public/control-layout.js',import.meta.url),'utf8')).split('export function setupControlEditor')[0];
  const saved=[{id:'theme-toggle',visible:false},{id:'history-toggle',visible:true}];
  const nodes={},order=[];
  vm.runInNewContext(source,{localStorage:{getItem:()=>JSON.stringify(saved)},document:{getElementById:id=>nodes[id]??={id},querySelector:()=>({append:node=>order.push(node.id)})}});
  assert.deepEqual(order.slice(0,2),saved.map(x=>x.id));assert.equal(nodes['theme-toggle'].hidden,true);assert.equal(nodes['stats-toggle'].hidden,true);
});
test('Stats does no widget rendering while hidden and resumes with latest shared status',async()=>{
  let visibility,updates=0;
  const source=(await readFile(new URL('../public/stats.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace('export function','function');
  const node=()=>({dataset:{},append(){},replaceChildren(){updates++;},set textContent(v){updates++;}});
  const context=vm.createContext({document:{querySelector:()=>({content:'UTC'}),getElementById:node,createElement:node},statsSnapshot,formatTime:()=>'-',setupFloatingWidget:o=>{visibility=o.onVisibility;visibility(false);}});
  vm.runInContext(source,context);
  context.updateStats({status:{},reachable:true,receivedAt:Date.now(),hours:2});assert.equal(updates,0);
  visibility(true);assert.ok(updates>0);visibility(false);updates=0;context.updateStats({status:{},reachable:false,hours:6});assert.equal(updates,0);
});

test('OpenWeather uses separate successful fetch times and retry schedule, including failure and unconfigured states',async()=>{
  let texts=[];
  const source=(await readFile(new URL('../public/stats.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace('export function','function');
  const node=()=>({dataset:{},append(){},replaceChildren(){},set textContent(v){texts.push(v);}});
  const context=vm.createContext({document:{querySelector:()=>({content:'UTC'}),getElementById:node,createElement:node},statsSnapshot,formatTime:time=>String(time),setupFloatingWidget:o=>o.onVisibility(true)});
  vm.runInContext(source,context);texts=[];
  context.updateStats({status:{weather:{configured:true,fetchedAt:10000,forecastFetchedAt:20000,nextAttemptAt:30000,error:'Failed'}},reachable:true,receivedAt:Date.now(),hours:2});
  for(const expected of ['Current weather','10','Minute forecast','20','Next check','30','Problem'])assert.ok(texts.includes(expected),expected);
  texts=[];
  context.updateStats({status:{weather:{configured:false,fetchedAt:null,nextAttemptAt:null}},reachable:true,receivedAt:Date.now(),hours:2});
  assert.ok(texts.includes('Not configured'));assert.ok(!texts.includes('Current weather'));
});

test('Stats replaces the next estimate with real acquisition activity, but not stale activity',async()=>{
  let texts=[];
  const source=(await readFile(new URL('../public/stats.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace('export function','function');
  const node=()=>({dataset:{},append(){},replaceChildren(){},set textContent(v){texts.push(v);}});
  const context=vm.createContext({document:{querySelector:()=>({content:'UTC'}),getElementById:node,createElement:node},statsSnapshot,formatTime:time=>String(time),setupFloatingWidget:o=>o.onVisibility(true)});
  vm.runInContext(source,context);
  const update=(fetching,nextUpdate,reachable=true)=>{texts=[];context.updateStats({status:{sources:{main:{time:100,nextCheckAt:300000,fetching,nextUpdate,state:'ready'}}},receivedAt:Date.now(),reachable,hours:2});};
  update(true,null);assert.ok(texts.includes('Checking…'));assert.ok(!texts.includes('Fetching…'));
  update(true,{state:'fetching'});assert.equal(texts.filter(t=>t==='Fetching…').length,2);
  assert.ok(texts.some(t=>t.startsWith('100 ·')),'Latest remains the last completed observation');
  update(false,null);assert.ok(texts.includes('300'));assert.ok(!texts.includes('Fetching…'));
  update(true,{state:'fetching'},false);assert.ok(!texts.includes('Fetching…'));assert.ok(texts.includes('Last received'));
});
