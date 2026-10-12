import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {atomicJson,exists,readJson} from './history-files.js';
import {displayDefaults,displayChoices,validDisplay} from '../public/display-options.js';
export async function createDisplaySettings(directory,units={}, {pendingUnits=false}={}){
 const path=join(directory,'settings','display.json');await mkdir(join(directory,'settings'),{recursive:true});
 let state=await exists(path)?await readJson(path):{version:1,revision:1,pendingUnits,pendingFormats:true,values:{...displayDefaults,...validDisplay(units)}};
 if(state.version!==1||!Number.isSafeInteger(state.revision)||!state.values||Object.keys(state.values).length!==Object.keys(displayChoices).length||Object.entries(state.values).some(([key,value])=>!Object.hasOwn(displayChoices,key)||!displayChoices[key].includes(value)))throw Error('Invalid display settings');
 if(state.pendingUnits&&!pendingUnits)state={...state,revision:state.revision+1,pendingUnits:false,values:{...state.values,...validDisplay(units)}};
 await atomicJson(path,state);let busy=false;
 const current=()=>structuredClone(state);
 async function save(values,flags){
  if(busy)return {status:409,error:'Display settings are being saved.'};
  const next={...state,...flags,revision:state.revision+1,values:{...state.values,...values}};
  busy=true;try{await atomicJson(path,next);state=next;return {status:200,...current()};}finally{busy=false;}
 }
 return {current,async adoptUnits(units){if(!state.pendingUnits)return {status:200,...current()};return save(validDisplay(units),{pendingUnits:false});},async adoptFormats(formats){
  if(!state.pendingFormats)return {status:200,...current()};
  const keys=['directionFormat','directionConvention','sunMode','moonMode'];
  if(!formats||typeof formats!=='object'||Array.isArray(formats)||Object.keys(formats).length!==keys.length||keys.some(key=>!displayChoices[key].includes(formats[key])))return {status:400,error:'Invalid legacy display formats.'};
  return save(formats,{pendingFormats:false});
 },async configure(input){
  if(busy)return {status:409,error:'Display settings are being saved.'};
  if(!input?.values||typeof input.values!=='object'||Array.isArray(input.values)||Object.entries(input.values).some(([key,value])=>!Object.hasOwn(displayChoices,key)||!displayChoices[key].includes(value)))return {status:400,error:'Choose supported display units and formats.'};
  return save(input.values,{pendingUnits:false,pendingFormats:false});
 }};
}
