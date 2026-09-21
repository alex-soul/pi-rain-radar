import {haFields,defaultUnits,unitChoices} from '../public/weather-policy.js';
import {atomicJson,exists,readJson} from './history-files.js';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

export async function createWeatherSettings(store,{settingsFile=null,now=Date.now,owmEnabled=false,rainbowEnabled=false,onChange=()=>{}}={}){
  let state=await store.weatherState('policy');
  if(settingsFile&&await exists(settingsFile)){
    const durable=await readJson(settingsFile);
    if(durable.version!==1||!Number.isSafeInteger(durable.revision))throw Error('Invalid saved weather settings');
    if(!state||durable.revision>state.revision){state=durable;if(state.effectiveAt)await store.saveWeatherPolicy(state);else await store.saveWeatherState('policy',state);}
  }
  if(!state){
    state={version:1,revision:0,initialized:false,source:'openweather',fallback:false,mappings:Object.fromEntries(haFields.map(f=>[f,'owm'])),units:{...defaultUnits},baseline:null,owmCollect:owmEnabled,haCollect:false,rainviewerCollect:true,rainbowCollect:rainbowEnabled};
    await store.saveWeatherState('policy',state);
  }
  if(settingsFile){await mkdir(dirname(settingsFile),{recursive:true,mode:0o700});await atomicJson(settingsFile,state);}
  let busy=false;
  const current=()=>structuredClone(state);
  return {current,
    async configure(input){
      if(busy)return {status:409,error:'Settings are being saved. Try again shortly.'};
      if(!input||typeof input!=='object')return {status:400,error:'Invalid weather settings.'};
      const next=current();
      for(const key of ['fallback','owmCollect','haCollect','rainviewerCollect','rainbowCollect']){
        if(input[key]===undefined)continue;
        if(typeof input[key]!=='boolean')return {status:400,error:'Invalid collection setting.'};next[key]=input[key];
      }
      if(input.source!==undefined){if(!['ha','openweather'].includes(input.source))return {status:400,error:'Invalid weather source.'};next.source=input.source;}
      if(input.mappings!==undefined){
        if(!input.mappings||typeof input.mappings!=='object')return {status:400,error:'Invalid weather mappings.'};
        for(const field of haFields)if(input.mappings[field]!==undefined){const entity=input.mappings[field];if(typeof entity!=='string'||entity.length>256||entity!=='owm'&&!/^sensor\.[a-z0-9_]+$/.test(entity))return {status:400,error:'Choose a sensor entity for each HA reading.'};next.mappings[field]=entity;}
      }
      if(input.units!==undefined){
        if(!input.units||typeof input.units!=='object')return {status:400,error:'Invalid weather units.'};
        for(const [key,choices] of Object.entries(unitChoices))if(input.units[key]!==undefined){if(!choices.includes(input.units[key]))return {status:400,error:'Invalid weather units.'};next.units[key]=input.units[key];}
      }
      if(!state.initialized&&input.confirmUnits===true){next.initialized=true;next.baseline={...next.units};}
      if(!next.initialized&&(next.haCollect||input.units&&!input.confirmUnits))return {status:400,error:'Confirm shared weather units first.'};
      if(JSON.stringify(next)===JSON.stringify(state))return {status:200,...current()};
      busy=true;
      try{
        next.revision=state.revision+1;next.effectiveAt=Math.max(now(),(state.effectiveAt??0)+1);
        // One SQLite transaction: the effective boundary and latest policy cannot
        // disagree after power loss. Boundary context survives rolling cleanup.
        // Operational preferences also survive replacement of a corrupt archive.
        // The durable intent repairs an interrupted commit on next startup.
        if(settingsFile)await atomicJson(settingsFile,next);
        try{await store.saveWeatherPolicy(next);}catch(error){if(settingsFile)await atomicJson(settingsFile,state);throw error;}
        state=next;await onChange(current());return {status:200,...current()};
      }finally{busy=false;}
    },
  };
}
