import {advanceGrassWetness} from './grass-wetness-model.js';
import {advanceGrassWetness as advanceV1} from './grass-wetness-model-v1.js';
import {validateGrassSettings} from './grass-wetness-settings.js';

export const decimalGrass=reading=>reading?.eligible&&Number.isFinite(reading.moisture)?Math.max(0,Math.min(5,reading.moisture*(reading.parameters?.sensitivity??1))):null;
// Replay ordered, complete input snapshots, never interpolated chart points.
export function replayGrass(samples,parameters,initialState=null,{trace=false}={}){
  if(parameters&&!validateGrassSettings(parameters))throw Error('Invalid replay settings');
  let state=initialState?structuredClone(initialState):null,last=-Infinity;
  return samples.map(sample=>{
    if(!Number.isFinite(sample.time)||sample.time<=last)throw Error('Replay times must increase');last=sample.time;
    const snapshot=parameters?{...sample.snapshot,policy:{...sample.snapshot.policy,grassWetness:parameters}}:sample.snapshot;
    let effects=null;
    const version=sample.modelVersion??1;
    if(![1,2].includes(version))throw Error('Unsupported Grass model version: '+version);
    const advance=version===1?advanceV1:advanceGrassWetness;
    const result=advance(state,snapshot,sample.time,trace?step=>{effects=step;}:undefined);state=result.state;
    return {time:sample.time,value:decimalGrass(result.reading),moisture:result.reading.moisture,reason:result.reading.reason,reading:result.reading,...(trace?{effects}:{})};
  });
}
export function alignedGrass(points,at){
  const point=points.findLast(p=>p.time<=at);
  return point&&at-point.time<=600000&&Number.isFinite(point.value)?point:null;
}
export function observationComparison(points,observations){
  const pairs=observations.map(o=>({observation:o,point:alignedGrass(points,o.observedAt)})).filter(p=>p.point);
  return {count:pairs.length,meanAbsoluteDifference:pairs.length?pairs.reduce((sum,p)=>sum+Math.abs(p.point.value-p.observation.intensity),0)/pairs.length:null};
}
