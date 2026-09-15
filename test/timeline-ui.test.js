import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(app.slice(app.indexOf('function timelineWindow('), app.indexOf('let timelineFrames')), context);
const frames = Array.from({length:13}, (_,i)=>({time:60000+i*600}));
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
