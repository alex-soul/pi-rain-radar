import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {grassLabels} from '../public/grass-wetness-settings.js';

test('mobile entry stays idle until save, submits only the observation and retains failed input',async()=>{
 const node=()=>({children:[],value:'',textContent:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;},append(child){this.children.push(child);}});
 const ids=Object.fromEntries(['grades','grade-label','observation-form','save-message','observed-at','save-observation','note','time-details','time-summary'].map(id=>[id,node()]));
 const requests=[];let fail=true;
 const source=await readFile(new URL('../scripts/dev-grass-observe.js',import.meta.url),'utf8');
 runInNewContext(source.replace(/^import .*;$/gm,''),{
   grassLabels,crypto,document:{getElementById:id=>ids[id],createElement:node},
   saveGrassObservation:async value=>{requests.push(structuredClone(value));if(fail)throw Error('Offline');return value;},
 });
 assert.equal(requests.length,0,'opening the form must not fetch history or other data');
 await ids['observation-form'].onsubmit({preventDefault(){}});
 assert.equal(requests.length,0,'an intensity is required');
 ids.grades.children[0].onclick();ids.note.value='test wet patch';
 const before=Date.now();await ids['observation-form'].onsubmit({preventDefault(){}});
 const sent=requests[0];
 assert.deepEqual(Object.keys(sent).sort(),['id','intensity','note','observedAt']);assert.equal(sent.intensity,0);
 assert.ok(sent.observedAt>=before&&sent.observedAt<=Date.now());
 assert.equal(ids.note.value,'test wet patch');assert.match(ids['save-message'].textContent,/entry is still here/);
 await ids['observation-form'].onsubmit({preventDefault(){}});assert.deepEqual(requests[1],sent,'retry keeps ID and observation instant');
 ids['time-details'].open=true;ids['time-details'].ontoggle();assert.match(ids['observed-at'].value,/^\d{4}-\d\d-\d\dT\d\d:\d\d$/);assert.equal(ids['time-summary'].textContent,'Time: past');
 ids['observed-at'].value='2999-01-01T12:00';await ids['observation-form'].onsubmit({preventDefault(){}});assert.equal(requests.length,2);assert.match(ids['save-message'].textContent,/past/);
 ids['observed-at'].value='';await ids['observation-form'].onsubmit({preventDefault(){}});assert.equal(requests.length,2);
 fail=false;ids['observed-at'].value='2026-10-28T22:22';
 await ids['observation-form'].onsubmit({preventDefault(){}});
 assert.equal(requests[2].observedAt,new Date('2026-10-28T22:22').getTime());
 assert.match(ids['save-message'].textContent,/Saved/);assert.equal(ids.note.value,'');
 assert.ok(ids.grades.children.every(button=>button.attributes['aria-pressed']==='false'));
 ids['time-details'].open=false;ids['time-details'].ontoggle();assert.equal(ids['observed-at'].value,'');assert.equal(ids['time-summary'].textContent,'Time: now');
});
