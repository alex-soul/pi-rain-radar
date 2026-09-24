import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {cameraAt} from '../public/camera-model.js';
import {formatTime} from '../public/time.js';
const source=(await readFile(new URL('../public/camera-widget.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function updateCamera','function updateCamera');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(response){
  const nodes=new Map(),requests=[];let visibility;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},hidden:false,textContent:'',removeAttribute(name){delete this[name];}});return nodes.get(id);};
  const context=vm.createContext({document:{getElementById:element,querySelector:()=>({content:'UTC'})},window:{dispatchEvent(){}},Event,AbortSignal,Date,cameraAt,formatTime,
    fetch:async url=>({ok:true,json:async()=>{requests.push(url);return response;}}),
    setupFloatingWidget:options=>{visibility=options.onVisibility;visibility(true);},
    createFrameLoader:options=>{assert.equal(options.maxImages,2);return {cancel(){},prepare:asset=>new Promise(resolve=>requests.push({asset,resolve}))};},
  });vm.runInContext(source,context);
  return {nodes,requests,update:value=>context.updateCamera(value),visible:value=>visibility(value)};
}
test('camera widget ignores obsolete decoding, clears gaps, and does not decode while hidden',async()=>{
  const f=fixture({}),now=Date.now(),a={time:now-300000,asset:'/a',basis:'metadata',data:{name:'Earlier'}},b={time:now,asset:'/b',basis:'acquisition',data:{name:'Later'}};
  const selected={cameraHistory:{records:[a,b],counts:{metadata:1,acquisition:1}}};
  f.update({selected,time:a.time/1000,hours:2});
  f.update({selected,time:b.time/1000,hours:2});
  f.requests.filter(r=>r.asset==='/a')[0].resolve({});await tick();assert.equal(f.nodes.get('camera-image').hidden,true);
  f.requests.filter(r=>r.asset==='/b').at(-1).resolve({});await tick();assert.equal(f.nodes.get('camera-image').src,'/b');assert.match(f.nodes.get('camera-time').textContent,/^\d{2}:\d{2}$/);
  f.update({selected,time:(now+600001)/1000,hours:2});assert.equal(f.nodes.get('camera-image').hidden,true);
  const count=f.requests.length;f.visible(false);f.update({selected,time:a.time/1000,hours:2});assert.equal(f.requests.length,count);
});
test('Live camera stays current through manual radar scrubbing and clears on source change',async()=>{
  const now=Date.now(),status={end:Math.floor(now/1000),camera:{source:'a',lastSuccess:now}};
  const latest={time:now,asset:'/current',basis:'metadata',data:{name:'Current'}};
  const f=fixture({latest,status:{source:'a'},counts:{metadata:1,acquisition:0}});
  f.update({status,time:status.end-7200,hours:2});await tick();
  f.update({status,time:status.end-3600,hours:2});f.requests.find(r=>r.asset==='/current').resolve({});await tick();
  assert.equal(f.nodes.get('camera-image').src,'/current');assert.match(f.nodes.get('camera-time').textContent,/^\d{2}:\d{2}$/);
  f.update({status:{...status,camera:{source:'b'}},time:status.end,hours:2});assert.equal(f.nodes.get('camera-image').hidden,true);
});
test('camera holds the displayed snapshot and timestamp until its replacement is ready',async()=>{
 const f=fixture({}),now=Date.now(),a={time:now-300000,asset:'/old',basis:'metadata',data:{name:'Camera'}},b={time:now,asset:'/next',basis:'metadata',data:{name:'Camera'}};
 const selected={cameraHistory:{records:[a,b],counts:{}}};f.update({selected,time:a.time/1000,hours:2});f.requests.find(r=>r.asset==='/old').resolve({});await tick();
 const oldStamp=f.nodes.get('camera-time').textContent;
 f.update({selected,time:b.time/1000,hours:2});assert.equal(f.nodes.get('camera-image').src,'/old');assert.equal(f.nodes.get('camera-image').hidden,false);assert.equal(f.nodes.get('camera-time').textContent,oldStamp);
 f.requests.filter(r=>r.asset==='/next').at(-1).resolve({});await tick();assert.equal(f.nodes.get('camera-image').src,'/next');
});
