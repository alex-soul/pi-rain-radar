import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('function timelineWindow('), app.indexOf('let timelineFrames')), context);
const frames = Array.from({length:13}, (_,i)=>({time:60000+i*600}));
test('speed changes replace the timeout, scale final hold and do not unpause or advance the frame', () => {
  let speed=1, nextId=0;
  const timers=new Map(), events={};
  const c=vm.createContext({sequence:frames,index:3,playing:false,pending:null,
    playbackSpeed:()=>speed, window:{addEventListener:(name,fn)=>events[name]=fn},
    setTimeout:(fn,delay)=>{timers.set(++nextId,{fn,delay});return nextId;},clearTimeout:id=>timers.delete(id),
    showFrame(){},adopt(){}});
  vm.runInContext(app.slice(app.indexOf('let playbackTimer;'),app.indexOf('$("play").addEventListener')),c);
  c.schedulePlayback(); assert.equal([...timers.values()][0].delay,650);
  speed=2; events['radar-playback-speed'](); assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,325);
  assert.equal(c.index,3);assert.equal(c.playing,false);
  c.index=12;speed=0.5;events['radar-playback-speed']();assert.equal([...timers.values()][0].delay,3200);
});
test('timeline always spans two hours and marks missing middle and edge slots', () => {
  const full=context.timelineWindow(frames);
  assert.equal(full.start,60000);assert.equal(full.end,67200);assert.equal(full.missing.length,0);
  const partial=frames.filter((_,i)=>![0,5,12].includes(i));
  const model=context.timelineWindow(partial,67200);
  assert.deepEqual(Array.from(model.missing),[0,5,12]);
  assert.equal(model.start,60000);
  assert.match(model.gradient,/var\(--timeline-gap\)/);
  assert.equal(context.nearestTimelineFrame(partial,60000,5),3);
  assert.equal(context.nearestTimelineFrame(partial,60000,12),9);
});

test('2/4/6-hour windows retain every ten-minute slot including missing ends and interior frames',()=>{
  for(const hours of [2,4,6]) {
    const steps=hours*6,end=100000,start=end-hours*3600;
    const offered=Array.from({length:steps+1},(_,i)=>({time:start+i*600})).filter((_,i)=>![0,5,steps].includes(i));
    const model=context.timelineWindow(offered,end,hours);
    assert.equal(model.steps,steps);assert.equal(model.start,start);
    assert.deepEqual(Array.from(model.missing),[0,5,steps]);
    assert.match(model.gradient,/var\(--timeline-gap\)/);
    assert.equal(context.nearestTimelineFrame(offered,start,steps),offered.length-1);
  }
});
test('live and historical keyboard navigation skip missing slots without getting stuck', () => {
  for(const historyWindow of [null,{start:60000,end:67200}]) {
    const handlers={};let shown;
    const c=vm.createContext({historyWindow,sequence:frames.filter((_,i)=>i!==5),index:4,playing:true,
      $:()=>({addEventListener:(key,fn)=>handlers[key]=fn}),showFrame:()=>{shown=c.index;}});
    vm.runInContext(app.slice(app.indexOf('// Keyboard navigation skips'), app.indexOf('async function decodeFrames')),c);
    handlers.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(shown,5);assert.equal(c.sequence[shown].time,63600);
    handlers.keydown({key:'Home',preventDefault(){}});assert.equal(shown,0);
    handlers.keydown({key:'End',preventDefault(){}});assert.equal(shown,11);
  }
});
