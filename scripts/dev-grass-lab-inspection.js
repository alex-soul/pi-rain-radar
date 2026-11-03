// Recorded configuration changes only: imported notes and sandbox sliders are
// deliberately not inputs. Times identify the first retained snapshot with the
// changed value, rather than claiming an exact settings-save timestamp.
export function recordedSettingChanges(samples,definitions){
 const result=[];let previous=null;
 for(const sample of samples){
  const current=sample.snapshot?.policy?.grassWetness;
  if(!current){previous=null;continue;}
  if(previous){
   const changes=definitions.filter(({key})=>Object.hasOwn(previous,key)&&Object.hasOwn(current,key)&&previous[key]!==current[key])
    .map(definition=>({...definition,from:previous[definition.key],to:current[definition.key]}));
   if(changes.length)result.push({time:sample.time,changes});
  }
  previous=current;
 }
 return result;
}
export function sampleAt(samples,at){
 let low=0,high=samples.length;
 while(low<high){const mid=Math.floor((low+high)/2);if(samples[mid].time<=at)low=mid+1;else high=mid;}
 const index=low-1;
 return index>=0&&at-samples[index].time<=600000?index:-1;
}
export const windowCursor=(at,start,end)=>Math.max(start,Math.min(end,at));
