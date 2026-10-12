import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {defaultUnits,unitChoices,weatherFields} from '../public/weather-policy.js';
import {legacyDisplayFormats,displayDefaults,validDisplay,effectiveDisplay} from '../public/display-options.js';
const source=async name=>(await readFile(new URL('../public/'+name,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
test('existing 0.11 browser adopts formats even when shared units were already initialized',async()=>{
 const saved={'radar-display':JSON.stringify({directionFormat:'degrees'}),'radar-astronomy-dock':JSON.stringify({sun:'position',moon:'event'})};
 const calls=[];const context=vm.createContext({defaultUnits,unitChoices,weatherFields,legacyDisplayFormats,localStorage:{getItem:key=>saved[key]??null},window:{dispatchEvent(){}},Event,AbortSignal,
 fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({initialized:true,revision:7,units:defaultUnits,displaySettings:{pendingFormats:false,values:calls[0].formats}})};}});
 vm.runInContext(await source('integrations-state.js'),context);
 context.acceptIntegrationStatus({weatherPolicy:{initialized:true,revision:7,units:defaultUnits},displaySettings:{pendingFormats:true}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);assert.equal(calls[0].formats.sunMode,'position');assert.equal(calls[0].formats.directionFormat,'degrees');
 context.acceptIntegrationStatus({weatherPolicy:{initialized:true,revision:7,units:defaultUnits},displaySettings:{pendingFormats:false}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);
});
test('0.11 screens migrate to inheritance, while explicit new-version overrides survive reload',async()=>{
 const saved={'radar-display':JSON.stringify({temperatureUnit:'C',directionFormat:'degrees'}),'radar-astronomy-dock':JSON.stringify({sun:'event'})};
 const shared={initialized:true,units:{...defaultUnits,temperatureUnit:'F'},displaySettings:{values:{sunMode:'position'}}};
 const context=vm.createContext({document:{getElementById(){}},localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v},shared,displayDefaults,validDisplay,effectiveDisplay});
 vm.runInContext(await source('screen-display.js'),context);
 assert.equal(context.screenDisplay().temperatureUnit,'F');assert.equal(context.screenDisplay().sunMode,'position');assert.deepEqual(JSON.parse(saved['radar-display-overrides']).values,{});
 shared.displaySettings.values.sunMode='event';assert.equal(context.screenDisplay().sunMode,'event');
 saved['radar-display-overrides']=JSON.stringify({version:1,values:{sunMode:'position'}});
 const reopened=vm.createContext({document:{getElementById(){}},localStorage:{getItem:k=>saved[k]??null},shared,displayDefaults,validDisplay,effectiveDisplay});
 vm.runInContext(await source('screen-display.js'),reopened);assert.equal(reopened.screenDisplay().sunMode,'position');
});
