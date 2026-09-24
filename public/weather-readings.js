import {weatherFields,weatherKeys,selectHaReadings,defaultUnits} from './weather-policy.js';
import {readingNames,temperatureText,windText,windDirectionText,visibilityText,pressureText} from './weather-format.js';

// One source/freshness model for visible readings, hidden-reading health and
// Settings. Call separately with current operational data during Archive replay.
export function weatherReadings(state,now,{historical=false,preferences={},gustMinutes=60}={}){
  const policy=state?.presentation?.policy??state?.policy,units={...defaultUnits,...preferences,...(historical?state?.units:policy?.units)};
  const current=state?.data?.current,failures=state?.failures??(state?.error?1:0);
  const fresh=!!current&&current.time*1000>now-1800000&&current.time*1000<=now+(historical?0:300000);
  const usable=!!state?.configured&&fresh&&failures<2,cached=usable&&(failures>0||!!state?.error);
  const ha=policy?selectHaReadings({...policy,units},state.presentation?.observations,state,now,{historical}):{};
  const rows={};
  for(const id of weatherFields){
    const selected=policy?.mappings?.[id]??'owm',mapped=ha[id];
    let value=usable?current?.[weatherKeys[id]]:null,source=Number.isFinite(value)?'openweather':null;
    let time=source?current.time*1000:null,receivedAt=source?state.fetchedAt:null,retained=cached,reason='',health='ready',attribution='';
    const expected=mapped?.expected??(selected==='disabled'?'disabled':'openweather');
    if(expected==='disabled'){
      value=null;source=null;time=null;receivedAt=null;retained=false;reason='Disabled';health='unconfigured';
    }else if(expected==='ha'){
      ({value,source,time,receivedAt}=mapped);retained=mapped.fallback||(source==='openweather'&&cached);reason=mapped.reason??'';attribution=mapped.attribution??'';
      health=!source?'error':retained?'warning':'ready';
    }else{
      // Only an OWM assignment can use the optional retained gust preference.
      if(id==='gust'){
        const gust=gustMinutes===0?null:state?.gust;
        const valid=state?.configured&&Number.isFinite(gust?.mph)&&Number.isFinite(gust?.time)&&gust.time*1000>now-gustMinutes*60000&&gust.time*1000<=now+(historical?0:300000);
        if(valid){value=gust.mph;source='openweather';time=gust.time*1000;receivedAt=gust.fetchedAt??null;retained=!fresh||cached||current?.gustMph!==gust.mph||current?.time!==gust.time;}
        else if(gustMinutes===0&&cached){value=null;source=null;}
      }
      if(!state) {health='error';reason='Appliance unreachable';}
      else if(!state.configured){health='unconfigured';reason='OpenWeather not configured';}
      else if(state.fetching&&!state.fetchedAt&&!state.error){health='warning';reason='Waiting for first reading';}
      else if(!usable){health='error';reason=state.error||'Reading missing or expired';}
      else if(cached){health='warning';reason=state.error||'Retained after a failed refresh';}
      else if(source){health=retained?'warning':'ready';reason=retained?'Retained gust':'';}
      else if(id==='gust'){health='ready';reason='Optional gust not reported';}
      else{health='error';reason='Reading not reported';}
      if(policy?.owmCollect===false){health=source?'warning':'unconfigured';reason='Collection disabled';}
    }
    let text='—',unit='';
    if(['temperature','feels','dew'].includes(id)){unit='°'+units.temperatureUnit;if(Number.isFinite(value))text=source==='ha'?value.toFixed(1)+'°':temperatureText(value,units.temperatureUnit);}
    else if(['wind','gust'].includes(id)){unit=units.windUnit;if(Number.isFinite(value))text=source==='ha'?String(Math.round(value)):windText(value,units.windUnit);}
    else if(id==='humidity'){unit='%';if(Number.isFinite(value))text=Math.round(value)+'%';}
    else if(id==='direction'){if(Number.isFinite(value))text=windDirectionText(value,units.directionFormat,units.directionConvention);}
    else if(id==='visibility'){unit=units.visibilityUnit;text=source==='ha'&&Number.isFinite(value)?String(Number(value.toFixed(1))):visibilityText(value,unit);}
    else if(id==='pressure'){unit=units.pressureUnit;text=source==='ha'&&Number.isFinite(value)?String(Number(value.toFixed(2))):pressureText(value,unit);}
    else if(Number.isFinite(value))text=String(Number(value.toFixed(1)));
    const fallback=expected==='ha'&&source==='openweather';
    const sourceLabel=expected==='disabled'?'Disabled':fallback?'OpenWeather fallback':source==='ha'||expected==='ha'?'Home Assistant':'OpenWeather';
    rows[id]={id,name:readingNames[id],expected,source,sourceLabel,value:Number.isFinite(value)?value:null,text,unit,time,receivedAt,retained:!!retained,fallback,reason,health,attribution};
  }
  const inputs=[rows.temperature,rows.dew];
  const inUnit=row=>row.source==='ha'?row.value:units.temperatureUnit==='F'?row.value*1.8+32:row.value;
  const value=inputs.every(row=>Number.isFinite(row.value))?inUnit(inputs[0])-inUnit(inputs[1]):null;
  const health=inputs.some(row=>row.health==='error'||row.expected==='disabled'||row.health==='unconfigured')?'error':inputs.some(row=>row.health==='warning')?'warning':'ready';
  rows.depression={inputs,id:'depression',name:'T−Td',expected:'derived',source:'derived',sourceLabel:'Temperature − dew point',value,text:value===null?'—':value.toFixed(1)+'°',unit:'°'+units.temperatureUnit,time:null,receivedAt:null,health,retained:inputs.some(row=>row.retained),fallback:false,attribution:inputs.map(row=>row.attribution).filter(Boolean).join(' · '),reason:'Dew point depression. '+inputs.map(row=>row.name+': '+row.text+' · '+row.sourceLabel+(row.reason?' · '+row.reason:'')).join('; ')};
  return rows;
}
export function weatherHealth(rows){
  const enabled=Object.values(rows).filter(row=>row.expected!=='disabled'&&!['gust','depression'].includes(row.id));
  const health=enabled.some(row=>row.health==='error')?'error':enabled.some(row=>row.health==='warning')?'warning':enabled.some(row=>row.health==='ready')?'ready':'unconfigured';
  const summary=health==='error'?'Some readings unavailable':health==='warning'?'Some readings retained or delayed':health==='ready'?'Weather readings available':enabled.length?'Collection disabled or not configured':'All readings disabled';
  return {health,summary};
}
export function readingExplanation(row,stamp){
  if(row.inputs)return 'T−Td: '+row.text+' · Dew point depression (temperature minus dew point). '+row.inputs.map(input=>readingExplanation(input,stamp)).join(' · ');
  const value=row.text==='—'?'—':row.text.replace(/[°%]$/,'')+(row.unit?' '+row.unit:'');
  return [row.name+': '+value,row.sourceLabel,
    row.time?(row.source==='ha'?'Reported to HA ':'Observed ')+stamp(row.time):null,
    row.receivedAt?'Acquired '+stamp(row.receivedAt):null,row.reason||null].filter(Boolean).join(' · ');
}
export function weatherProviderHealth(state,provider,now,{configured=true}={}){
  const policy=state?.presentation?.policy??state?.policy;
  if(!configured)return {health:'unconfigured',summary:'Not configured'};
  if(policy?.[provider==='ha'?'haCollect':'owmCollect']===false)return {health:'unconfigured',summary:'Configured · Collection disabled'};
  const raw=provider==='ha'?state:{...state,presentation:policy?{policy:{...policy,source:'openweather'},observations:{}}:undefined};
  const rows=Object.values(weatherReadings(raw,now)).filter(row=>!['gust','depression'].includes(row.id)&&(provider==='ha'?row.expected==='ha':row.expected!=='disabled'));
  if(!rows.length)return {health:'unconfigured',summary:'Configured · No assigned readings'};
  if(provider==='ha')return rows.some(row=>row.source!=='ha')?{health:'error',summary:'Some HA readings unavailable'}:{health:'ready',summary:'Collecting'};
  return weatherHealth(Object.fromEntries(rows.map(row=>[row.id,row])));
}

export function readingSourceCaption(row){
  if(row.id==='depression'){
    const sources=new Set(row.inputs.map(input=>input.source==='ha'?'HA':input.source==='openweather'?'OpenWeather':input.expected==='ha'?'HA':'OpenWeather'));
    return ['OpenWeather','HA'].filter(source=>sources.has(source)).join('/');
  }
  if(row.id==='gust'&&row.expected==='openweather'&&row.health==='ready')return 'OpenWeather (optional)';
  return row.sourceLabel+(row.reason&&row.reason!==row.sourceLabel?' · '+row.reason:'');
}
