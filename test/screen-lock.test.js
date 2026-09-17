import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../public/screen-lock.js',import.meta.url),'utf8')).replaceAll('export ', '');
function fixture(saved='false') {
  const handlers={}, documentHandlers={}, nodes={}, classes=new Set();let editable=true, stored=saved, observer;
  function node(id) { return nodes[id]??={handlers:{},attributes:{},dataset:{},checked:false,hidden:false,
    addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(k,v){this.attributes[k]=String(v);},
    getAttribute(k){return this.attributes[k]??null;},hasAttribute(k){return k in this.attributes;},removeAttribute(k){delete this.attributes[k];},
    get href(){return this.attributes.href;},matches(selector){return selector==='a[href]'?this.hasAttribute('href'):this.required;},focus(){},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}}; }
  const optional=node('optional');optional.attributes.href='https://example.org';
  const required=node('required');required.required=true;required.attributes.href='https://www.rainviewer.com/';
  const ctx=vm.createContext({MutationObserver:class {constructor(fn){observer=fn;}observe(){}},Node:{ELEMENT_NODE:1},document:{body:{classList:{contains:k=>classes.has(k),toggle(k,v){v?classes.add(k):classes.delete(k);}}},getElementById:node,querySelector:node,querySelectorAll:()=>[optional,required],addEventListener:(k,fn)=>documentHandlers[k]=fn},window:{addEventListener:(k,fn)=>handlers[k]=fn,dispatchEvent(){}},localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},Event,URL,setTimeout,canEdit:()=>editable});
  vm.runInContext(source+'\nsetupScreenLock(canEdit);',ctx);
  return {handlers,nodes,node,classes,optional,required,stored:()=>stored,editable:v=>editable=v,mutate:records=>observer(records)};
}
test('screen lock is local, persists, preserves required links and restores optional links',()=>{
  const a=fixture(), b=fixture();
  a.node('screen-lock').checked=true;a.node('screen-lock').handlers.change();
  assert.equal(a.stored(),'true');assert.equal(b.stored(),'false');
  assert.equal(a.optional.hasAttribute('href'),false);assert.equal(a.optional.getAttribute('aria-disabled'),'true');
  assert.equal(a.required.getAttribute('href'),'https://www.rainviewer.com/');
  assert.equal(a.node('.map-controls').inert,true);
  assert.equal(fixture(a.stored()).node('screen-lock').checked,true);
  a.editable(false);a.node('screen-lock').checked=false;a.node('screen-lock').handlers.change();assert.equal(a.node('screen-lock').checked,true);
  a.editable(true);a.node('screen-lock').checked=false;a.node('screen-lock').handlers.change();
  assert.equal(a.optional.getAttribute('href'),'https://example.org');assert.equal(a.node('.map-controls').inert,false);
});
test('locked pointer, keyboard and wheel events cannot reach controls; settings and credit routes remain usable',()=>{
  const f=fixture('true');
  for(const type of ['pointerdown','pointermove','pointerup','click','keydown','keyup','input','change','wheel','touchmove','dragstart']) {
    let stopped=false,prevented=false;
    f.handlers[type]({type,key:'ArrowRight',cancelable:true,target:{closest:()=>null},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
    assert.equal(stopped,true,type);assert.equal(prevented,true,type);
  }
  for(const type of ['click','pointerdown','keydown']) f.handlers[type]({type,target:{closest:()=>({})},stopImmediatePropagation(){assert.fail('Allowed route blocked');}});
  f.handlers.keydown({type:'keydown',key:'Tab',target:{closest:()=>null},stopImmediatePropagation(){assert.fail('Tab blocked');}});
  assert.equal(f.node('settings-toggle').hidden,false);
});

test('external URL titles follow changed destinations',()=>{
  const f=fixture();assert.equal(f.optional.title,'https://example.org');
  f.optional.setAttribute('href','https://example.org/new');
  f.mutate([{type:'attributes',target:f.optional}]);
  assert.equal(f.optional.title,'https://example.org/new');
});
