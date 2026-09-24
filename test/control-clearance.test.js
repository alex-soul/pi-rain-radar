import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/control-layout.js',import.meta.url),'utf8');
test('controls clear expanded dock, return when collapsed, and stay still during a pointer gesture', () => {
  let offset=0, draw, observe, dockRect={left:8,right:382,top:0,bottom:84};
  const handlers={};
  const stack={style:{getPropertyValue:()=>String(offset),setProperty:(_,value)=>{offset=parseFloat(value);}},getBoundingClientRect:()=>({left:8,right:172,top:8+offset})};
  stack.children=[{hidden:false,getBoundingClientRect:()=>({...stack.getBoundingClientRect(),bottom:54+offset})}];
  const dock={getBoundingClientRect:()=>dockRect};
  const c=vm.createContext({document:{querySelector:()=>stack,getElementById:()=>dock,addEventListener:(name,fn)=>handlers[name]=fn},
    window:{innerWidth:390,addEventListener:(name,fn)=>handlers[name]=fn},requestAnimationFrame:fn=>{draw=fn;return 1;},
    ResizeObserver:class {constructor(fn){observe=fn;}observe(){}},MutationObserver:class {observe(){}}});
  vm.runInContext(source.slice(source.indexOf('export function setupResponsiveControls')).replace('export ',''),c);
  c.setupResponsiveControls();draw();assert.equal(offset,88);
  handlers.pointerdown({pointerId:1});dockRect={left:157,right:233,top:0,bottom:18};observe();draw();assert.equal(offset,88);
  handlers.pointerup({pointerId:1});draw();assert.equal(offset,22);
  c.window.innerWidth=1280;handlers.resize();draw();assert.equal(offset,0,'wide screens allow overlap');
  c.window.innerWidth=1024;handlers.resize();draw();assert.equal(offset,22,'tablet collisions displace');
  dockRect={left:450,right:526,top:0,bottom:18};observe();draw();assert.equal(offset,0);
});
