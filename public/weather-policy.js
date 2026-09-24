// Shared by the collector and replay. HA values are validated, never converted.
export const haFields=['temperature','feels','wind','gust','humidity','dew','direction','visibility','pressure','uv'];
export const haUnitChoices={temperature:['C','F'],feels:['C','F'],dew:['C','F'],wind:['mph','km/h','m/s','kn'],gust:['mph','km/h','m/s','kn'],humidity:['%'],direction:['°'],visibility:['km','mi'],pressure:['hPa','inHg','mmHg'],uv:['index']};
export const haUnitFor=(field,units)=>['temperature','feels','dew'].includes(field)?units.temperatureUnit:['wind','gust'].includes(field)?units.windUnit:field==='visibility'?units.visibilityUnit:field==='pressure'?units.pressureUnit:field==='humidity'?'%':field==='direction'?'°':'index';
export const weatherKeys={temperature:'temperature',feels:'feelsLike',wind:'windMph',gust:'gustMph',humidity:'humidity',dew:'dewPoint',direction:'windDirection',visibility:'visibility',pressure:'pressure',uv:'uvi'};
export const weatherFields=Object.keys(weatherKeys);
export const haEntities=policy=>[...new Set(haFields.map(field=>policy.mappings?.[field]).filter(entity=>/^sensor\.[a-z0-9_]+$/.test(entity)))];
export function filterCurrent(current,mappings={}){
  if(!current)return null;
  const result={...current};
  for(const [field,key] of Object.entries(weatherKeys))if(mappings[field]==='disabled')delete result[key];
  return result;
}
export const defaultUnits={temperatureUnit:'C',windUnit:'mph',visibilityUnit:'km',pressureUnit:'hPa'};
export const unitChoices={temperatureUnit:['C','F'],windUnit:['mph','km/h','m/s','kn'],visibilityUnit:['km','mi'],pressureUnit:['hPa','inHg','mmHg']};
export function canonicalUnit(value){
  const key=String(value??'').trim().toLowerCase();
  return ({'°c':'C','c':'C','celsius':'C','°f':'F','f':'F','fahrenheit':'F','mph':'mph','mi/h':'mph','km/h':'km/h','kph':'km/h','m/s':'m/s','kn':'kn','kt':'kn','kts':'kn','knots':'kn','%':'%','°':'°','deg':'°','degrees':'°','km':'km','mi':'mi','hpa':'hPa','inhg':'inHg','mmhg':'mmHg','':'index','index':'index','uv index':'index'})[key]??null;
}
export function normalizeHaReading(state,receivedAt){
  const text=typeof state?.state==='string'?state.state.trim():'';
  const value=text!==''&&Number.isFinite(Number(text))?Number(text):null;
  const reportedAt=typeof state?.last_reported==='string'?Date.parse(state.last_reported):NaN;
  return {value,unit:canonicalUnit(state?.attributes?.unit_of_measurement),reportedUnit:String(state?.attributes?.unit_of_measurement??'').slice(0,24),
    time:Number.isFinite(reportedAt)?reportedAt:null,basis:Number.isFinite(reportedAt)?'ha-reported':'unknown',receivedAt,
    updatedAt:typeof state?.last_updated==='string'?state.last_updated:null,
    attribution:typeof state?.attributes?.attribution==='string'?state.attributes.attribution.slice(0,500):'',
    reason:value===null?'HA reading unavailable':null};
}
export function selectHaReadings(policy,observations,owm,time,{historical=false,comparison=false}={}){
  const result={},current=owm?.data?.current;
  const owmFresh=!!owm?.configured&&current&&current.time*1000<=time+(historical?0:300000)&&current.time*1000>time-1800000&&(owm.failures??0)<2;
  const keys=weatherKeys;
  for(const field of haFields){
    if(policy.mappings[field]==='disabled'){
      result[field]={expected:'disabled',source:null,fallback:false,reason:null,unit:null,entity:null,value:null,time:null,receivedAt:null,basis:null,attribution:''};continue;
    }
    const entity=policy.mappings[field]??'owm',expected=!comparison&&policy.source==='ha'&&entity!=='owm'?'ha':'openweather';
    const unit=haUnitFor(field,policy.units);
    const sample=observations?.[entity];let reason=null;
    if(expected==='ha'){
      if(!sample||sample.reason||!Number.isFinite(sample.value))reason=sample?.reason??'HA reading unavailable';
      else if(sample.unit!==unit)reason='Unit mismatch. Change the unit in Home Assistant or in Settings to match.';
      else if(!Number.isFinite(sample.time))reason='HA report timestamp unavailable';
      else if(sample.time>time+(historical?0:300000)||sample.receivedAt>time)reason='HA report timestamp is in the future';
      else if(time-sample.time>600000)reason='HA report is older than ten minutes';
      else if((['wind','gust','visibility','uv'].includes(field)&&sample.value<0)||(field==='humidity'&&(sample.value<0||sample.value>100))||(field==='direction'&&(sample.value<0||sample.value>360))||(field==='pressure'&&sample.value<=0))reason='HA reading invalid';
    }
    const fallback=expected==='ha'&&!!reason&&policy.fallback;
    const source=expected==='ha'&&!reason?'ha':(expected==='openweather'||fallback)&&owmFresh&&Number.isFinite(current[keys[field]])?'openweather':null;
    result[field]={expected,source,fallback:source==='openweather'&&expected==='ha',reason,unit,entity:expected==='ha'?entity:null,
      value:source==='ha'?sample.value:source==='openweather'?current[keys[field]]:null,
      time:source==='ha'?sample.time:source==='openweather'?current.time*1000:null,
      receivedAt:source==='ha'?sample.receivedAt:source==='openweather'?owm.fetchedAt:null,
      basis:source==='ha'?sample.basis:source==='openweather'?'observation':null,
      attribution:expected==='ha'?sample?.attribution??'':source==='openweather'?'OpenWeather':''};
  }
  return result;
}
