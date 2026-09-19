import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../public/device-power.js',import.meta.url),'utf8')).replace('export function','function');
function fixture(status=202){
  const nodes=new Map(),calls=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,{open:false,hidden:false,listeners:[],classList:{toggle(){},add(){}},focus(){this.focused=true;},showModal(){this.open=true;},close(){this.open=false;const list=[...this.listeners];this.listeners=this.listeners.filter(x=>!x.once);for(const x of list)if(x.name==='close')x.fn();},addEventListener(name,fn,opts={}){this.listeners.push({name,fn,...opts});}});return nodes.get(id);};
  get('settings-dialog').open=true;
  const context=vm.createContext({document:{getElementById:get},crypto:{randomUUID:()=> 'test-request'}});
  vm.runInContext(source,context);
  const ui=context.setupDevicePower(()=>get('settings-dialog').open,async(path,body)=>{
    if(!body)return {ok:true,json:async()=>({state:'ready'})};
    calls.push(body);if(status==='network')throw Error('offline');
    return {status,json:async()=>({error:'Not confirmed'})};
  });
  get('settings-dialog').addEventListener('close',()=>ui.clear());
  return {get,calls};
}
for(const action of ['restart','shutdown'])test(`accepted ${action} exits Settings and survives its cleanup`,async()=>{
  const f=fixture();await f.get('power-'+action).onclick();
  assert.equal(f.calls.length,0);assert.equal(f.get('power-dialog').open,true);
  await f.get('power-confirm').onclick();
  assert.equal(f.calls.length,1);assert.equal(f.get('settings-dialog').open,false);
  assert.equal(f.get('power-dialog').open,false);assert.equal(f.get('power-ack-dialog').open,true);
  assert.equal(f.get('power-ack-title').textContent,action==='restart'?'Reboot initiated':'Shutdown initiated');
  assert.equal(f.get('power-ack-close').focused,true);
  await f.get('power-confirm').onclick();assert.equal(f.calls.length,1);
  f.get('power-ack-close').onclick();assert.equal(f.get('power-ack-dialog').open,false);
});
for(const status of [503,'network'])test(`unconfirmed power ${status} stays in Settings without retry`,async()=>{
  const f=fixture(status);await f.get('power-restart').onclick();await f.get('power-confirm').onclick();
  assert.equal(f.calls.length,1);assert.equal(f.get('settings-dialog').open,true);
  assert.equal(f.get('power-ack-dialog').open,false);assert.equal(f.get('power-title').textContent,'Power request not confirmed');
});
