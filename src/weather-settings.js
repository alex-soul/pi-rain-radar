import {haFields,weatherFields,defaultUnits,unitChoices} from '../public/weather-policy.js';
import {atomicJson,exists,readJson} from './history-files.js';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

export async function createWeatherSettings(store,{settingsFile=null,now=Date.now,owmEnabled=false,rainbowEnabled=false,beforeChange=()=>{},onChange=()=>{}}={}){
  let state=await store.weatherState('policy');
  if(settingsFile&&await exists(settingsFile)){
    const durable=await readJson(settingsFile);
    if(durable.version!==1||!Number.isSafeInteger(durable.revision))throw Error('Invalid saved weather settings');
    if(!state||durable.revision>state.revision){state=durable;if(state.effectiveAt)await store.saveWeatherPolicy(state);else await store.saveWeatherState('policy',state);}
  }
  // Existing pre-policy installations with a saved OWM key retain their readings.
  // A new installation starts with every reading explicitly disabled.
  if(!state){
    state={version:1,revision:0,perReadingSources:true,initialized:false,source:'openweather',fallback:false,mappings:Object.fromEntries(weatherFields.map(f=>[f,owmEnabled?'owm':'disabled'])),units:{...defaultUnits},baseline:null,owmCollect:owmEnabled,forecastCollect:owmEnabled,haCollect:false,rainviewerCollect:true,rainbowCollect:rainbowEnabled};
    await store.saveWeatherState('policy',state);
  }
  // Extend the live policy at a new boundary; old records retain their policy.
  if(!state.perReadingSources||state.forecastCollect===undefined||weatherFields.some(field=>state.mappings[field]===undefined)){
    state={...state,forecastCollect:state.forecastCollect??state.owmCollect,mappings:{...Object.fromEntries(weatherFields.map(f=>[f,'owm'])),...state.mappings},revision:state.revision+1,effectiveAt:Math.max(now(),(state.effectiveAt??0)+1)};
    // Legacy HA mappings could be collected without supplying the display.
    // Translate its selected source, not those inactive alternatives.
    if(!state.perReadingSources&&state.source!=='ha')for(const field of haFields)if(state.mappings[field].startsWith('sensor.'))state.mappings[field]='owm';
    state.perReadingSources=true;
    if(settingsFile){await mkdir(dirname(settingsFile),{recursive:true,mode:0o700});await atomicJson(settingsFile,state);}
    await store.saveWeatherPolicy(state);
  }
  if(settingsFile){await mkdir(dirname(settingsFile),{recursive:true,mode:0o700});await atomicJson(settingsFile,state);}
  let busy=false,initializing=null;
  const current=()=>structuredClone(state);
  return {current,
    async initialize(units){
      if(state.initialized)return {status:200,...current()};
      if(initializing)return initializing;
      initializing=this.configure({units,confirmUnits:true});
      try{return await initializing;}finally{initializing=null;}
    },
    async configure(input){
      if(busy)return {status:409,error:'Settings are being saved. Try again shortly.'};
      if(!input||typeof input!=='object')return {status:400,error:'Invalid weather settings.'};
      const next=current();
      for(const key of ['fallback','owmCollect','forecastCollect','haCollect','rainviewerCollect','rainbowCollect']){
        if(input[key]===undefined)continue;
        if(typeof input[key]!=='boolean')return {status:400,error:'Invalid collection setting.'};next[key]=input[key];
      }
      if(input.source!==undefined){if(!['ha','openweather'].includes(input.source))return {status:400,error:'Invalid weather source.'};next.source=input.source;}
      if(input.mappings!==undefined){
        if(!input.mappings||typeof input.mappings!=='object')return {status:400,error:'Invalid weather mappings.'};
        for(const [field,entity] of Object.entries(input.mappings)){
          if(!weatherFields.includes(field)||typeof entity!=='string'||entity.length>256||!['owm','disabled'].includes(entity)&&!(haFields.includes(field)&&/^sensor\.[a-z0-9_]+$/.test(entity)))return {status:400,error:'Choose a supported source for each reading.'};
          next.mappings[field]=entity;
        }
        if(input.source===undefined)next.source=haFields.some(field=>next.mappings[field].startsWith('sensor.'))?'ha':'openweather';
      }
      if(input.haCollect===false){for(const field of haFields)if(!['owm','disabled'].includes(next.mappings[field]))next.mappings[field]='owm';next.source='openweather';}
      if(input.mappings&&!next.haCollect&&haFields.some(field=>next.mappings[field].startsWith('sensor.')))return {status:400,error:'Enable Home Assistant weather before choosing its readings.'};
      if(input.units!==undefined){
        if(!input.units||typeof input.units!=='object')return {status:400,error:'Invalid weather units.'};
        for(const [key,choices] of Object.entries(unitChoices))if(input.units[key]!==undefined){if(!choices.includes(input.units[key]))return {status:400,error:'Invalid weather units.'};next.units[key]=input.units[key];}
      }
      if(!state.initialized&&input.confirmUnits===true){next.initialized=true;next.baseline={...next.units};}
      if(!next.initialized&&(next.haCollect||input.units&&!input.confirmUnits))return {status:400,error:'Confirm shared weather units first.'};
      if(JSON.stringify(next)===JSON.stringify(state))return {status:200,...current()};
      busy=true;
      try{
        await beforeChange(next);
        next.revision=state.revision+1;next.effectiveAt=Math.max(now(),(state.effectiveAt??0)+1);
        // One SQLite transaction: the effective boundary and latest policy cannot
        // disagree after power loss. Boundary context survives rolling cleanup.
        // Operational preferences also survive replacement of a corrupt archive.
        // The durable intent repairs an interrupted commit on next startup.
        if(settingsFile)await atomicJson(settingsFile,next);
        try{await store.saveWeatherPolicy(next);}catch(error){if(settingsFile)await atomicJson(settingsFile,state);throw error;}
        state=next;return {status:200,...current()};
      }finally{try{await onChange(current());}finally{busy=false;}}
    },
  };
}
