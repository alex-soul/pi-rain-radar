import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('map progress stays visible over old frames, distinguishes preview and permits failure dismissal', async () => {
  const app=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
  const nodes=new Map();
  const $=id=>{
    if(!nodes.has(id)) nodes.set(id,{hidden:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},querySelector(name){return $(id+name);}});
    return nodes.get(id);
  };
  const context=vm.createContext({$,displayed:{},status:{},window:{addEventListener(){}},poll(){}});
  vm.runInContext(app.slice(app.indexOf('let mapUpdateVisible = false;'),app.indexOf('let pollRunning = false;')),context);
  context.paintMapUpdate({busy:true,applying:false});
  assert.equal($('empty').hidden,true,'preview does not show apply progress');
  context.paintMapUpdate({applying:true});
  assert.equal($('empty').hidden,false);
  assert.equal($('emptyh2').textContent,'Preparing map');
  context.paintMapUpdate({applying:true,progress:{completed:3,total:13}});
  assert.match($('emptyp').textContent,/3 of 13/);
  context.status.mapUpdate={applying:false,error:'Existing map kept'};
  context.paintMapUpdate(context.status.mapUpdate);
  assert.equal($('map-update-dismiss').hidden,false);
  $('map-update-dismiss').handlers.click();
  assert.equal($('empty').hidden,true);
  context.paintMapUpdate({applying:true});
  assert.equal($('empty').hidden,false);
  context.paintMapUpdate({applying:false,error:null});
  assert.equal($('empty').hidden,true);
});
