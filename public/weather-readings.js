import {weatherFields,weatherKeys,selectHaReadings,selectObservedRain,defaultUnits} from './weather-policy.js';
import {readingNames,temperatureText,windText,windBearing,windDirectionText,visibilityText,pressureText} from './weather-format.js';
import {readingValues} from './reading-units.js';

// One source/freshness model for visible readings, hidden-reading health and
// Settings. Call separately with current operational data during Archive replay.
export function weatherReadings(state,now,{historical=false,preferences={},gustMinutes=60}={}){
  const policy=state?.presentation?.policy??state?.policy,units={...defaultUnits,...(historical?state?.units:policy?.units),...preferences};
  const current=state?.data?.current,failures=state?.failures??(state?.error?1:0);
  const fresh=!!current&&current.time*1000>now-1800000&&current.time*1000<=now+(historical?0:300000);
  const usable=!!state?.configured&&fresh&&failures<2,cached=usable&&(failures>0||!!state?.error);
  const ha=policy?selectHaReadings(policy,state.presentation?.observations,state,now,{historical}):{};
  const rows={};
  for(const id of weatherFields){
    const selected=policy?.mappings?.[id]??(id==='irradiance'?'disabled':'owm'),mapped=ha[id];
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
    const observedUnit=source==='ha'?mapped.unit:['temperature','feels','dew'].includes(id)?'C':['wind','gust'].includes(id)?'mph':id==='visibility'?'m':id==='pressure'?'hPa':mapped?.unit;
    const {canonicalValue,displayValue}=readingValues(value,id,source,observedUnit,units);
    let text='—',unit='';
    if(['temperature','feels','dew'].includes(id)){unit='°'+units.temperatureUnit;if(Number.isFinite(displayValue))text=(Math.abs(displayValue)<.05?0:displayValue).toFixed(1)+'°';}
    else if(['wind','gust'].includes(id)){unit=units.windUnit;if(Number.isFinite(displayValue))text=String(Math.round(displayValue));}
    else if(id==='humidity'){unit='%';if(Number.isFinite(value))text=Math.round(value)+'%';}
    else if(id==='direction'){if(Number.isFinite(value))text=windDirectionText(value,units.directionFormat);}
    else if(id==='visibility'){unit=units.visibilityUnit;text=Number.isFinite(displayValue)?String(Number(displayValue.toFixed(1)))+(source==='openweather'&&value>=10000?'+':''):'—';}
    else if(id==='pressure'){unit=units.pressureUnit;text=Number.isFinite(displayValue)?(unit==='hPa'?String(Math.round(displayValue)):unit==='inHg'?displayValue.toFixed(2):displayValue.toFixed(1)):'—';}
    else if(id==='irradiance'){unit='W/m²';if(Number.isFinite(value))text=String(Math.round(value));}
    else if(Number.isFinite(value))text=String(Number(value.toFixed(1)));
    const fallback=expected==='ha'&&source==='openweather';
    const sourceLabel=expected==='disabled'?'Disabled':fallback?'OpenWeather fallback':source==='ha'||expected==='ha'?'Home Assistant':'OpenWeather';
    rows[id]={id,name:readingNames[id],expected,source,sourceLabel,value:Number.isFinite(value)?value:null,canonicalValue,displayValue,observedUnit,text,unit,time,receivedAt,retained:!!retained,fallback,reason,health,attribution};
  }
  const inputs=[rows.temperature,rows.dew];
  const inUnit=row=>row.displayValue;
  const value=inputs.every(row=>Number.isFinite(row.value))?inUnit(inputs[0])-inUnit(inputs[1]):null;
  const health=inputs.some(row=>row.health==='error'||row.expected==='disabled'||row.health==='unconfigured')?'error':inputs.some(row=>row.health==='warning')?'warning':'ready';
  rows.depression={inputs,id:'depression',name:'Dew point depression',expected:'derived',source:'derived',sourceLabel:'Temperature − dew point',value,displayValue:value,canonicalValue:inputs.every(r=>Number.isFinite(r.canonicalValue))?inputs[0].canonicalValue-inputs[1].canonicalValue:null,text:value===null?'—':value.toFixed(1)+'°',unit:'°'+units.temperatureUnit,time:null,receivedAt:null,health,retained:inputs.some(row=>row.retained),fallback:false,attribution:inputs.map(row=>row.attribution).filter(Boolean).join(' · '),reason:'Dew point depression. '+inputs.map(row=>row.name+': '+row.text+' · '+row.sourceLabel+(row.reason?' · '+row.reason:'')).join('; ')};
  const rainPolicy=policy??{},rain=selectObservedRain(rainPolicy,state?.presentation?.observations??state?.observations,now);
  const rainFactors={mm:1,cm:10,in:25.4},rainUnit=preferences.rainUnit??units.rainUnit??'mm';
  const enabled=!!rain.entity,valueRain=rain.eligible?rain.value*rainFactors[rain.unit]/rainFactors[rainUnit]:null;
  rows.rainAccumulation={...rain,id:'rainAccumulation',name:'Rain accumulation',expected:enabled?'ha':'disabled',
    source:rain.eligible?'ha':null,sourceLabel:enabled?'Home Assistant':'Disabled',value:valueRain,displayValue:valueRain,canonicalValue:rain.eligible?rain.value*rainFactors[rain.unit]:null,
    text:valueRain===null?'—':valueRain.toFixed(rainUnit==='mm'?1:2),unit:rainUnit,observedUnit:rain.unit,retained:false,fallback:false,
    health:!enabled||!rainPolicy.haCollect?'unconfigured':rain.eligible?'ready':'error',
    attribution:rain.attribution??'',reason:rain.reason??'Observed running total since the sensor’s last reset; not rain intensity or a forecast.'};
  const estimate=state?.presentation?.grassWetness,grassEnabled=!!policy?.grassWetness?.enabled;
  const missingGrassInput=['temperature','dew','wind','irradiance'].find(key=>!rows[key]?.source||!Number.isFinite(rows[key]?.value));
  const grassSetup=[];
  if(policy){
    for(const key of ['temperature','dew','wind','irradiance'])if(rows[key].expected==='disabled'||rows[key].health==='unconfigured')grassSetup.push(`${readingNames[key]}: ${rows[key].reason||'not configured'}`);
    if(!rain.entity)grassSetup.push('Observed rain (accumulated): not configured');
    if(!policy.haCollect)grassSetup.push('Home Assistant collection is off');
  }
  const grassValid=!grassSetup.length&&!missingGrassInput&&rain.eligible&&grassEnabled&&estimate?.eligible&&Number.isInteger(estimate.intensity)&&estimate.intensity>=0&&estimate.intensity<=5&&Number.isFinite(estimate.calculatedAt)&&estimate.calculatedAt<=now&&now-estimate.calculatedAt<=600000;
  const grassValue=grassValid?estimate.intensity:null;
  rows.grassWetness={id:'grassWetness',name:'Grass wetness',expected:grassEnabled?'derived':'disabled',source:grassValid?'derived':null,sourceLabel:'Grass wetness estimate',value:grassValue,canonicalValue:grassValue,displayValue:grassValue,text:grassValue===null?'—':String(grassValue),unit:'',time:estimate?.calculatedAt??null,receivedAt:estimate?.calculatedAt??null,health:!grassEnabled||grassSetup.length?'unconfigured':grassValid?'ready':'error',retained:false,fallback:false,attribution:'',reason:!grassEnabled?'Calculation disabled':grassSetup.length?'Setup required: '+grassSetup.join('; '):missingGrassInput?readingNames[missingGrassInput]+': '+(rows[missingGrassInput].reason||'unavailable'):!rain.eligible?'Rain accumulation: '+rain.reason:!estimate?'Waiting for weather readings':now-estimate.calculatedAt>600000?'Weather data is out of date':estimate.reason??'Unavailable'};
  rows.grassWetness.setupMissing=grassSetup;
  rows.grassWetness.status=!grassEnabled?'disabled':grassSetup.length?'setup':grassValid?'ready':rows.grassWetness.reason.startsWith('Warming')?'warming':'unavailable';
  return rows;
}
export function weatherHealth(rows){
  const enabled=Object.values(rows).filter(row=>row.expected!=='disabled'&&!['gust','depression','grassWetness'].includes(row.id));
  const health=enabled.some(row=>row.health==='error')?'error':enabled.some(row=>row.health==='warning')?'warning':enabled.some(row=>row.health==='ready')?'ready':'unconfigured';
  const summary=health==='error'?'Some readings unavailable':health==='warning'?'Some readings retained or delayed':health==='ready'?'Weather readings available':enabled.length?'Collection disabled or not configured':'All readings disabled';
  return {health,summary};
}
export function readingExplanation(row,stamp){
  if(row.inputs)return row.name+': '+row.text+' · Dew point depression (T−Td, temperature minus dew point). '+row.inputs.map(input=>readingExplanation(input,stamp)).join(' · ');
  const value=row.text==='—'?'—':row.text.replace(/[°%]$/,'')+(row.unit?' '+row.unit:'');
  const label=row.id==='direction'&&Number.isFinite(row.value)?`Wind from ${windDirectionText(row.value,'degrees')} (${windDirectionText(row.value)}), blowing towards ${windDirectionText(windBearing(row.value),'degrees')} (${windDirectionText(windBearing(row.value))}).`:row.name+': '+value;
  return [label,row.sourceLabel,
    row.time?(row.source==='ha'?'Reported to HA ':'Observed ')+stamp(row.time):null,
    row.receivedAt?'Acquired '+stamp(row.receivedAt):null,row.reason||null].filter(Boolean).join(' · ');
}
export function weatherProviderHealth(state,provider,now,{configured=true}={}){
  const policy=state?.presentation?.policy??state?.policy;
  if(!configured)return {health:'unconfigured',summary:'Not configured'};
  if(policy?.[provider==='ha'?'haCollect':'owmCollect']===false)return {health:'unconfigured',summary:'Configured · Collection disabled'};
  const raw=provider==='ha'?state:{...state,presentation:policy?{policy:{...policy,source:'openweather'},observations:{}}:undefined};
  const rows=Object.values(weatherReadings(raw,now)).filter(row=>!['gust','depression','grassWetness'].includes(row.id)&&(provider==='ha'?row.expected==='ha':row.expected!=='disabled'&&row.id!=='rainAccumulation'));
  if(!rows.length)return {health:'unconfigured',summary:'Configured · No assigned readings'};
  if(provider==='ha')return rows.some(row=>row.source!=='ha')?{health:'error',summary:'Some HA readings unavailable'}:{health:'ready',summary:'Collecting'};
  return weatherHealth(Object.fromEntries(rows.map(row=>[row.id,row])));
}

export function readingSourceCaption(row){
  if(row.id==='depression'){
    const sources=new Set(row.inputs.map(input=>input.source==='ha'?'HA':input.source==='openweather'?'OpenWeather':input.expected==='ha'?'HA':'OpenWeather'));
    return ['OpenWeather','HA'].filter(source=>sources.has(source)).join('/');
  }
  return row.sourceLabel;
}
