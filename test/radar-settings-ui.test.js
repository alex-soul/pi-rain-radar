import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=(await readFile(new URL('../public/radar-settings-ui.js',import.meta.url),'utf8')).replace('export ','');
function fixture() {
  const nodes=new Map();let configured=false,applied=0,failApply=false;
  function element(){return {value:'',checked:false,disabled:false,open:false,handlers:{},className:'',set id(v){nodes.set(v,this);},set innerHTML(v){},before(){},after(){},append(){},closest(){return element();},querySelector(){return this.option??=(element());},addEventListener(k,v){this.handlers[k]=v;},replaceChildren(){},reportValidity(){return true;},showModal(){this.open=true;},close(){this.open=false;},click(){return this.onclick?.();}};}
  function get(id){if(id==='fixture-toggle')return null;if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}
  const context={window:{addEventListener(){},dispatchEvent(){}},Event,document:{getElementById:get,createElement:element,createTextNode:v=>v,body:{append(){}}}};
  vm.runInNewContext(code+';this.setup=setupRadarSettings;',context);
  const request=async(path,data)=>{
    if(path==='')return {ok:true,json:async()=>({})};
    if(path==='/rainbow'){if(data)configured=!!data.apiKey;return {ok:true,status:200,json:async()=>({configured,usage:{requests:0,tiles:0}})};}
    applied++;return {ok:!failApply,status:failApply?400:200,json:async()=>({error:failApply?'Test failure':undefined})};
  };
  const ui=context.setup(()=>true,request);
  return {ui,get,configured:()=>configured,applied:()=>applied,fail:()=>{failApply=true;}};
}
test('initial key prompts only for unapplied provider changes; cancel keeps key and draft',async()=>{
  const f=fixture();await f.ui.load({main:'rainviewer',overview:'same'});
  f.get('radar-main-source').value='rainbow';f.get('rainbow-key').value='fake';await f.get('rainbow-save').onclick();
  assert.equal(f.get('radar-confirm-dialog').open,true);assert.equal(f.applied(),0);
  f.get('radar-confirm-cancel').onclick();assert.equal(f.configured(),true);assert.equal(f.get('radar-main-source').value,'rainbow');
  f.get('rainbow-key').value='replacement';await f.get('rainbow-save').onclick();assert.equal(f.get('radar-confirm-dialog').open,false);
  f.fail();await f.get('radar-apply').onclick();assert.equal(f.get('radar-source-note').textContent,'Test failure');assert.equal(f.get('radar-apply').disabled,false);
});
test('no source draft gives Configured only; accepted prompt uses normal apply path',async()=>{
  const f=fixture();await f.ui.load({main:'rainbow',overview:'same'});f.get('rainbow-key').value='fake';await f.get('rainbow-save').onclick();
  assert.equal(f.get('radar-confirm-dialog').open,false);assert.equal(f.get('rainbow-key-note').textContent,'Configured.');
  await f.get('rainbow-remove').onclick();f.get('radar-overview-source').value='rainviewer';f.get('rainbow-key').value='fake';await f.get('rainbow-save').onclick();
  assert.equal(f.get('radar-confirm-dialog').open,true);f.get('radar-confirm-apply').onclick();await Promise.resolve();await Promise.resolve();
  assert.equal(f.applied(),1);assert.equal(f.get('radar-confirm-dialog').open,false);
});

test('Rainbow stays unavailable without a key; removal disables the saved selection until a usable source is chosen',async()=>{
  const f=fixture();await f.ui.load({main:'rainbow',overview:'same'});
  assert.equal(f.get('radar-main-source').option.disabled,true);
  assert.equal(f.get('radar-apply').disabled,true);
  f.get('rainbow-key').value='fake';await f.get('rainbow-save').onclick();
  assert.equal(f.get('radar-main-source').option.disabled,false);
  assert.equal(f.get('radar-apply').disabled,false);
  await f.get('rainbow-remove').onclick();
  assert.equal(f.get('radar-main-source').value,'rainbow');
  assert.equal(f.get('radar-main-source').option.disabled,true);
  assert.equal(f.get('radar-apply').disabled,true);
  f.get('radar-main-source').value='rainviewer';f.get('radar-main-source').handlers.change();
  assert.equal(f.get('radar-apply').disabled,false);
});
