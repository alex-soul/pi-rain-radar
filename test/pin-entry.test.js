import test from 'node:test';
import assert from 'node:assert/strict';
import {setupPinEntry} from '../public/pin-entry.js';

function fixture() {
  let focused = -1;
  const fields = Array.from({length:6},(_,index)=>({value:'',handlers:{},focus(){focused=index;},select(){this.selected=true;},addEventListener(name,fn){this.handlers[name]=fn;}}));
  const group = {attributes:{},querySelectorAll:()=>fields,removeAttribute(name){delete this.attributes[name];},setAttribute(name,value){this.attributes[name]=value;}};
  return {fields,group,entry:setupPinEntry(group),focused:()=>focused};
}

test('PIN boxes filter letters, advance digits, distribute paste and preserve leading zeroes',()=>{
  const {fields,entry,focused} = fixture();
  let prevented=false;
  fields[0].handlers.keydown({key:'a',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  prevented=false;
  fields[0].handlers.beforeinput({data:'e',inputType:'insertText',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  fields[0].value='x';fields[0].handlers.input();assert.equal(fields[0].value,'');assert.equal(focused(),-1);
  fields[0].value='0';fields[0].handlers.input();assert.equal(fields[0].value,'0');assert.equal(focused(),1);
  assert.equal(fields[1].selected,true);
  fields[1].handlers.paste({preventDefault(){},clipboardData:{getData:()=> '1a2 3-45678'}});
  assert.equal(entry.value(),'012345');assert.equal(focused(),5);
  entry.clear();assert.equal(entry.value(),'');
  fields[0].handlers.paste({preventDefault(){},clipboardData:{getData:()=> 'letters only'}});
  assert.equal(entry.value(),'');
});

test('PIN boxes support correction, keyboard boundaries, required state and clearing on disable',()=>{
  const {fields,group,entry,focused} = fixture();
  entry.setEnabled(true);assert.ok(fields.every(f=>f.required&&!f.disabled));
  fields[0].value='1';fields[1].handlers.keydown({key:'Backspace',preventDefault(){}});
  assert.equal(fields[0].value,'');assert.equal(focused(),0);
  fields[0].handlers.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(focused(),0);
  fields[5].handlers.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(focused(),5);
  fields[2].handlers.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(focused(),1);
  let prevented=false;
  fields[0].handlers.keydown({key:'v',ctrlKey:true,preventDefault(){prevented=true;}});assert.equal(prevented,false);
  entry.invalid();assert.equal(group.attributes['data-invalid'],'true');assert.equal(focused(),0);
  fields[0].value='8';fields[0].handlers.input();assert.equal(group.attributes['data-invalid'],undefined);
  entry.clear();entry.setEnabled(false);assert.ok(fields.every(f=>!f.required&&f.disabled));assert.equal(entry.value(),'');
});


test('completing a six-digit row advances only when all six positions are populated',()=>{
 const {fields,group}=fixture();
 let completed=0;
 const entry=setupPinEntry(group,()=>completed++);
 fields[5].value='5';fields[5].handlers.input();assert.equal(completed,0);
 entry.clear();
 fields[0].handlers.paste({preventDefault(){},clipboardData:{getData:()=> '012345'}});
 assert.equal(completed,1);assert.equal(entry.value(),'012345');
});
