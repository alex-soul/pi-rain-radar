import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {grassLabels} from '../public/grass-wetness-settings.js';

test('mobile entry stays idle until save, submits only the observation and retains failed input',async()=>{
 const node=()=>({children:[],value:'',textContent:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;},append(child){this.children.push(child);}});
 const ids=Object.fromEntries(['grades','grade-label','observation-form','save-message','observed-at','save-observation','note'].map(id=>[id,node()]));
 const requests=[];let fail=true;
 const source=await readFile(new URL('../scripts/dev-grass-observe.js',import.meta.url),'utf8');
 runInNewContext(source.replace("import {grassLabels} from '/grass-wetness-settings.js';",''),{
   grassLabels,AbortSignal,document:{getElementById:id=>ids[id],createElement:node},
   fetch:async(url,options)=>{requests.push({url,...options});if(fail)throw Error('Offline');return {ok:true,json:async()=>JSON.parse(options.body)};},
 });
 assert.equal(requests.length,0,'opening the form must not fetch history or other data');
 await ids['observation-form'].onsubmit({preventDefault(){}});
 assert.equal(requests.length,0,'an intensity is required');
 ids.grades.children[0].onclick();ids.note.value='test wet patch';
 const before=Date.now();await ids['observation-form'].onsubmit({preventDefault(){}});
 const sent=JSON.parse(requests[0].body);
 assert.equal(requests[0].url,'/__grass-lab/observations');assert.equal(requests[0].method,'POST');
 assert.deepEqual(Object.keys(sent).sort(),['intensity','note','observedAt']);assert.equal(sent.intensity,0);
 assert.ok(sent.observedAt>=before&&sent.observedAt<=Date.now());
 assert.equal(ids.note.value,'test wet patch');assert.match(ids['save-message'].textContent,/entry is still here/);
 fail=false;ids['observed-at'].value='2026-10-28T22:22';
 await ids['observation-form'].onsubmit({preventDefault(){}});
 assert.equal(JSON.parse(requests[1].body).observedAt,new Date('2026-10-28T22:22').getTime());
 assert.match(ids['save-message'].textContent,/Saved/);assert.equal(ids.note.value,'');
 assert.ok(ids.grades.children.every(button=>button.attributes['aria-pressed']==='false'));
});
