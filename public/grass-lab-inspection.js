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

// Contributions describe completed acquisition intervals (start, end], not
// every saved snapshot. Never fill an interval that the model did not calculate.
export function effectAt(steps,at){
 let low=0,high=steps.length;
 while(low<high){const mid=Math.floor((low+high)/2);if(steps[mid].end<at)low=mid+1;else high=mid;}
 const step=steps[low];return step&&step.start<at&&at<=step.end?step:null;
}

// Calendar-aligned ticks in the installation timezone, including DST changes.
// The quarter-hour scan also covers modern half/quarter-hour UTC offsets.
export function calendarTicks(start,end,width,timeZone='UTC'){
 const hours=(end-start)/3600000,target=Math.max(1,width/100);
 const spacing=[1,2,3,6,12,24,48,72,168,336,720].find(h=>h>=hours/target)??720;
 const format=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const result=[];
 for(let time=Math.ceil(start/900000)*900000;time<=end;time+=900000){
  const p=Object.fromEntries(format.formatToParts(time).map(p=>[p.type,p.value]));
  if(p.minute!=='00')continue;
  const hour=Number(p.hour),midnight=hour===0,day=Math.floor(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))/86400000);
  const major=spacing<24?hour%spacing===0:midnight&&day%(spacing/24)===0;
  // Keep daily midnight context when there is room, without crowding a month.
  if(major||(midnight&&width/hours*24>=24))result.push({time,midnight,major});
 }
 return result;
}
