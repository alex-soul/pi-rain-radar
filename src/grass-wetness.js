import {grassDefaults} from '../public/grass-wetness-settings.js';
import {readingValues} from '../public/reading-units.js';

export const grassModelVersion=1;
const clamp=value=>Math.max(0,Math.min(5,value));
const warmup=30*60000,maxGap=10*60000;
// An intentionally uncalibrated water reservoir, advanced only on a new HA
// cumulative-rain acquisition. Never interpret an unavailable input as zero.
export function advanceGrassWetness(previous,snapshot,now){
 const parameters={...grassDefaults,...snapshot.policy?.grassWetness};
 const base={modelVersion:grassModelVersion,parameters,calculatedAt:now,eligible:false,intensity:null};
 const unavailable=(reason,state=previous)=>({state,reading:{...base,reason}});
 if(!parameters.enabled)return unavailable('Calculation disabled',previous?{...previous,baseline:null}:null);
 const rows=snapshot.rows??{},rain=snapshot.observedRain,inputs={};
 for(const key of ['temperature','dew','wind','irradiance']){
  const row=rows[key];
  if(!row?.source||!Number.isFinite(row.value)||!Number.isFinite(row.time)||row.time>now+300000||now-row.time>(row.source==='ha'?600000:1800000))return unavailable(`${key==='irradiance'?'Solar irradiance':key==='dew'?'Dew point':key[0].toUpperCase()+key.slice(1)}: ${row?.reason||'reading missing, disabled or stale'}`);
  inputs[key]={...row,canonicalValue:readingValues(row.value,key,row.source,row.unit,{}).canonicalValue};
 }
 if(!rain?.eligible)return unavailable('Rain accumulation: '+(rain?.reason||'unavailable'));
 const acquired=rain.receivedAt;
 if(!Number.isFinite(acquired)||acquired>now||now-acquired>maxGap)return unavailable('Rain accumulation is stale');
 const total=rain.value*({mm:1,cm:10,in:25.4}[rain.unit]);
 if(!Number.isFinite(total)||total<0)return unavailable('Rain accumulation is invalid');
 const provenance={location:snapshot.location??null,inputs,rain:{...rain},connectionRevision:snapshot.connectionRevision??null};
 const sources=JSON.stringify([Object.values(inputs).map(r=>[r.source,r.entity,r.unit]),rain.entity,rain.unit,snapshot.location,provenance.connectionRevision]);
 let state=previous?.modelVersion===grassModelVersion?structuredClone(previous):null;
 const baseline=state?.baseline;
 const reset=baseline&&rain.resetAt!==baseline.resetAt;
 let delta=baseline?total-baseline.total:0;
 if(reset||delta<0){
  // A counter reset is only bridgeable with explicit bounded reset metadata.
  if(Number.isFinite(rain.resetAt)&&rain.resetAt>baseline.time&&rain.resetAt<=acquired&&Number.isFinite(rain.previousPeriod))delta=rain.previousPeriod*({mm:1,cm:10,in:25.4}[rain.unit])-baseline.total+total;
  else state=null;
  if(delta<0)state=null;
 }
 if(!state?.baseline||sources!==state.sources||acquired<state.baseline.time||acquired-state.baseline.time>maxGap){
  state={modelVersion:grassModelVersion,sources,moisture:2.5,startedAt:acquired,baseline:{time:acquired,total,resetAt:rain.resetAt}};
 }else if(acquired>state.baseline.time){
  const hours=(acquired-state.baseline.time)/3600000;
  const depression=Math.max(0,inputs.temperature.canonicalValue-inputs.dew.canonicalValue);
  const dryness=Math.min(1,depression/5),solar=Math.max(0,inputs.irradiance.canonicalValue),wind=Math.max(0,inputs.wind.canonicalValue);
  const wetting=Math.max(0,delta)*1.5*parameters.rain+hours*Math.max(0,1-depression/2)*0.4*parameters.dew;
  const drying=hours*(solar/400*parameters.solar+wind/10*dryness*parameters.wind+depression/10*parameters.air+state.moisture*0.12*parameters.drainage);
  state.moisture=clamp(state.moisture+wetting-drying);
  state.baseline={time:acquired,total,resetAt:rain.resetAt};
 }
 const ready=acquired-state.startedAt>=warmup;
 const reading={...base,calculatedAt:acquired,eligible:ready,intensity:ready?Math.round(clamp(state.moisture*parameters.sensitivity)):null,
  moisture:state.moisture,startedAt:state.startedAt,provenance,reason:ready?'Uncalibrated estimate · tune against your own observations.':'Warming up · needs 30 minutes of continuous readings.'};
 return {state,reading};
}
