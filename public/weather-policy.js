// Shared by the collector and replay. HA values are validated, never converted.
export const haFields=['temperature','feels','wind','gust'];
export const defaultUnits={temperatureUnit:'C',windUnit:'mph',visibilityUnit:'km',pressureUnit:'hPa'};
export const unitChoices={temperatureUnit:['C','F'],windUnit:['mph','km/h','m/s','kn'],visibilityUnit:['km','mi'],pressureUnit:['hPa','inHg','mmHg']};
export function canonicalUnit(value){
  const key=String(value??'').trim().toLowerCase();
  return ({'°c':'C','c':'C','celsius':'C','°f':'F','f':'F','fahrenheit':'F','mph':'mph','mi/h':'mph','km/h':'km/h','kph':'km/h','m/s':'m/s','kn':'kn','kt':'kn','kts':'kn','knots':'kn'})[key]??null;
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
  const keys={temperature:'temperature',feels:'feelsLike',wind:'windMph',gust:'gustMph'};
  for(const field of haFields){
    const entity=policy.mappings[field],expected=!comparison&&policy.source==='ha'&&entity!=='owm'?'ha':'openweather';
    const unit=policy.units[field==='temperature'||field==='feels'?'temperatureUnit':'windUnit'];
    const sample=observations?.[entity];let reason=null;
    if(expected==='ha'){
      if(!sample||sample.reason||!Number.isFinite(sample.value))reason=sample?.reason??'HA reading unavailable';
      else if(sample.unit!==unit)reason='Unit mismatch. Change the unit in Home Assistant or in Settings to match.';
      else if(!Number.isFinite(sample.time))reason='HA report timestamp unavailable';
      else if(sample.time>time+(historical?0:300000)||sample.receivedAt>time)reason='HA report timestamp is in the future';
      else if(time-sample.time>600000)reason='HA report is older than ten minutes';
      else if((field==='wind'||field==='gust')&&sample.value<0)reason='HA reading invalid';
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
