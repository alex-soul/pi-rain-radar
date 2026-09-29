import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalIdle,AFFORDANCE_IDLE_MS,UI_IDLE_MS} from '../public/local-idle.js';
import {normalizeLocal,trendWindow,captureInWindow} from '../public/local-preferences.js';
import {createTrendHistoryClient} from '../public/trend-history-client.js';
import {dockText} from '../public/dock-format.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const app=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');

test('paused stepping follows playable sequence without wrapping; locked idle resumes only that mode',()=>{
  const clicks={},events={},win={};let locked=true,hidden=0,painted=0,scheduled=0,now=0,id=0;const timers=new Map();
  const idle=options=>createLocalIdle({...options,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimer:id=>timers.delete(id)});
  const tick=ms=>{now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
  const c=vm.createContext({$:id=>({addEventListener:(name,fn)=>clicks[id]=fn}),sequence:[{time:1},{time:5},{time:9}],index:1,playing:false,historyWindow:{end:9},showFrame(){},createLocalIdle:idle,dismissAvailability(){hidden++;},paintStatus(){painted++;},schedulePlayback(){scheduled++;},document:{body:{classList:{contains:()=>locked}},addEventListener:(name,fn)=>events[name]=fn},window:{addEventListener:(name,fn)=>win[name]=fn}});
  vm.runInContext(app.slice(app.indexOf("for(const [id,delta]of"),app.indexOf('async function decodeFrames')),c);
  clicks['capture-previous']();assert.equal(c.index,0);clicks['capture-previous']();assert.equal(c.index,0);
  clicks['capture-next']();assert.equal(c.sequence[c.index].time,5);
  const target={closest:()=>true};events.pointerdown({target,pointerId:1});tick(60000);assert.equal(c.playing,false);
  win.pointerup({pointerId:1});tick(14999);assert.equal(c.playing,false);tick(1);assert.equal(c.playing,true);assert.equal(c.index,1);assert.equal(c.historyWindow.end,9);assert.equal(hidden,1);assert.equal(painted,1);assert.equal(scheduled,1);
  c.playing=false;locked=false;events.click({target});tick(60000);assert.equal(c.playing,false);
});

test('local idle is independent per area and held gestures/editors defer the full 15 seconds',()=>{
  let now=0,id=0,held=false;const timers=new Map(),hidden=[0,0];
  const setTimer=(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;};
  const clearTimer=id=>timers.delete(id);
  const tick=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
  const a=createLocalIdle({show(){},hide(){hidden[0]++;},held:()=>held,setTimer,clearTimer});
  const b=createLocalIdle({show(){},hide(){hidden[1]++;},setTimer,clearTimer});
  a.activity();b.activity();tick(10000);b.activity();tick(5000);assert.deepEqual(hidden,[1,0]);
  held=true;a.activity();tick(60000);assert.deepEqual(hidden,[1,1]);
  held=false;a.schedule();tick(14999);assert.equal(hidden[0],1);tick(1);assert.equal(hidden[0],2);
  a.activity();a.reset();tick(15000);assert.equal(hidden[0],3);
});

test('local preferences preserve zero opacity, reject invalid input and anchor all trend windows at playback end',()=>{
  assert.deepEqual(normalizeLocal(null),{opacity:{},lookback:null});
  assert.deepEqual(normalizeLocal({opacity:{top:0,bottom:100,trends:101,buttons:'50',unknown:50},lookback:24}),{opacity:{top:0,bottom:100},lookback:24});
  assert.deepEqual(trendWindow(100,100000,2),{start:92800,end:100000});
  assert.deepEqual(trendWindow(100,100000,null),{start:100,end:100000});
  assert.equal(captureInWindow(92799,92800,100000),false);
  assert.equal(captureInWindow(92800,92800,100000),true);
  assert.equal(captureInWindow(NaN,92800,100000),false);
});

test('trend history reuses requests while scrubbing and discards cancelled mode/window responses',async()=>{
  let ready=0,now=0;const calls=[];
  const client=createTrendHistoryClient({now:()=>now,onReady:()=>ready++,fetchHistory:args=>new Promise(resolve=>calls.push({args,resolve}))});
  const base={map:'a',end:100000,hours:6,revision:1,mode:'live',fallback:{weather:[]}};
  for(let i=0;i<100;i++)assert.equal(client.read(base),base.fallback);
  await Promise.resolve();assert.equal(calls.length,1);
  client.read({...base,mode:'archive',end:90000});await Promise.resolve();
  assert.equal(calls[0].args.signal.aborted,true);assert.equal(calls[1].args.signal.aborted,false);
  calls[0].resolve({old:true});await new Promise(setImmediate);assert.equal(ready,0);
  calls[1].resolve({current:true});await new Promise(setImmediate);assert.equal(ready,1);
  assert.deepEqual(client.read({...base,mode:'archive',end:90000}),{current:true});
  client.read({...base,hours:null});assert.equal(calls[1].args.signal.aborted,true);
  now=60000;client.read(base);await Promise.resolve();assert.equal(calls.length,3);
});

test('compact format keeps zero, precision, visibility cap and missing values without mutating source explanations',()=>{
  for(const [row,text] of [[{id:'uv',value:0,text:'0'},'0.0'],[{id:'visibility',value:10000,text:'10+',unit:'km'},'10.0+'],[{id:'pressure',value:1013,text:'29.91',unit:'inHg'},'29.91'],[{id:'pressure',value:1013,text:'759.8',unit:'mmHg'},'759.8'],[{id:'pressure',value:1013,text:'1013',unit:'hPa'},'1013'],[{id:'temperature',value:-1,text:'−1.0°'},'−1.0°'],[{id:'wind',value:null,text:'—'},'—']]){
    const original={...row};assert.equal(dockText(row),text);assert.deepEqual(row,original);
  }
});


test('affordances use one second after hover/touch/focus/editor activity, independently of global idle',async()=>{
 assert.equal(AFFORDANCE_IDLE_MS,1000);assert.equal(UI_IDLE_MS,15000);
 const source=await readFile(new URL('../public/local-ui.js',import.meta.url),'utf8');
 let now=0,id=0,awake=false,focused=false,observer;const timers=new Map(),events={},win={};
 const active={matches:()=>focused};
 const area={dataset:{},hasAttribute:()=>true,contains:el=>el===active,classList:{add:()=>awake=true,remove:()=>awake=false},addEventListener:(n,fn)=>(events[n]??=[]).push(fn),focus(){}};
 const editor={open:false};
 const idle=o=>createLocalIdle({...o,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimer:id=>timers.delete(id)});
 const c=vm.createContext({createLocalIdle:idle,AFFORDANCE_IDLE_MS,canEditLocal:()=>true,document:{activeElement:active,hasFocus:()=>true},window:{addEventListener:(n,fn)=>win[n]=fn},MutationObserver:class{constructor(fn){observer=fn;}observe(){}},queueMicrotask:fn=>fn()});
 vm.runInContext(source.slice(source.indexOf('export function setupAffordances'),source.indexOf('// Keep DOM')).replace('export function','function'),c);c.setupAffordances(area,editor);
 const fire=(n,e={})=>events[n]?.forEach(fn=>fn(e));
 const tick=ms=>{now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 fire('pointerenter',{pointerType:'mouse'});tick(20000);assert.equal(awake,true);
 fire('pointerleave');tick(999);assert.equal(awake,true);tick(1);assert.equal(awake,false);
 fire('pointerenter',{pointerType:'touch'});fire('pointerdown',{pointerId:1});tick(2000);assert.equal(awake,true);win.pointerup({pointerId:1});tick(1000);assert.equal(awake,false);
 focused=true;fire('focusin');tick(2000);assert.equal(awake,true);focused=false;fire('focusout');tick(1000);assert.equal(awake,false);
 editor.open=true;observer();tick(2000);assert.equal(awake,true);editor.open=false;observer();tick(1000);assert.equal(awake,false);
});
