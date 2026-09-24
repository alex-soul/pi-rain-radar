import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('function showFrame()'),app.indexOf("window.addEventListener('radar-layers-change'"));
const turn=()=>new Promise(r=>setImmediate(r));
test('rain, clouds and timestamp commit together; obsolete scrub decodes cannot replace the newest frame',async()=>{
 const nodes=Array.from({length:4},()=>({href:'old',style:{},dataset:{},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}}));
 const pending=new Map(),empty={};let paints=0;
 const sequence=[{time:1,url:'r1',overviewUrl:'o1',cloudUrl:'c1',overviewCloudUrl:'v1'},{time:2,url:'r2',overviewUrl:'o2',cloudUrl:'c2',overviewCloudUrl:'v2'}];
 const c=vm.createContext({sequence,index:0,renderRevision:0,renderPending:false,displayed:{time:0},historyWindow:null,status:{},mapUpdateVisible:false,
  mapObservation:(s,i,role)=>({url:s[i][role==='main'?'url':'overviewUrl']}),cloudUrls:f=>[f.cloudUrl,f.overviewCloudUrl],cloudNodes:nodes.slice(2),
  $:id=>id==='radar'?nodes[0]:id==='overview-radar'?nodes[1]:empty,
  frameLoader:{prepare(url){if(!pending.has(url)){let resolve;const promise=new Promise(r=>resolve=r);pending.set(url,{promise,resolve});}return pending.get(url).promise;}},paintProviderLabels(){},paintStatus(){paints++;}});
 vm.runInContext(code,c);c.showFrame();
 pending.get('r1').resolve({});pending.get('o1').resolve({});await turn();
 assert.deepEqual(nodes.map(n=>n.href),['old','old','old','old']);assert.equal(c.displayed.time,0);
 c.index=1;c.showFrame();for(const key of ['r2','o2','c2','v2'])pending.get(key).resolve({});await turn();
 assert.deepEqual(nodes.map(n=>n.href),['r2','o2','c2','v2']);assert.equal(c.displayed.time,2);assert.equal(c.renderPending,false);
 pending.get('c1').resolve({});pending.get('v1').resolve({});await turn();assert.equal(paints,1);assert.equal(c.displayed.time,2);
});
