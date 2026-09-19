import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../public/embed-settings-ui.js',import.meta.url),'utf8')).replace('export function','function');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('embed auto-saves serially, saves origins on change, and reverts failed enable',async()=>{
  const nodes=new Map(),writes=[];let finish,delay=true;
  const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,dataset:{},listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}});return nodes.get(id);};
  const initial={enabled:false,origins:['http://homeassistant.local:8123'],hours:2,speed:1,theme:'dark'};
  const context=vm.createContext({document:{getElementById:get},location:{href:'http://preview/'},URL,structuredClone,setTimeout,clearTimeout});
  vm.runInContext(source,context);
  const ui=context.setupEmbedSettings(()=>true,async(path,body)=>{
    if(!body)return {ok:true,json:async()=>initial};
    writes.push(body);if(delay){delay=false;await new Promise(resolve=>finish=resolve);}
    return {ok:body.origins[0]!=='invalid',json:async()=>({error:'Invalid origin'})};
  });
  await ui.load();assert.equal(get('embed-fields').hidden,true);
  get('embed-enabled').checked=true;get('embed-enabled').listeners.change();
  get('embed-theme').value='light';get('embed-theme').listeners.change();
  assert.equal(writes.length,1);finish();await flush();
  assert.equal(writes.length,2);assert.equal(writes[1].theme,'light');
  get('embed-origins').value='invalid';assert.equal(writes.length,2);
  get('embed-origins').listeners.change();await flush();assert.match(get('embed-note').textContent,/Invalid origin/);
  get('embed-enabled').checked=false;get('embed-enabled').listeners.change();await flush();
  assert.equal(writes.at(-1).enabled,false);assert.deepEqual([...writes.at(-1).origins],initial.origins);assert.equal(get('embed-fields').hidden,true);
  ui.clear();get('embed-enabled').checked=true;get('embed-enabled').listeners.change();assert.equal(writes.length,4);
});
