import {defaultUnits,selectHaReadings} from './weather-policy.js';
// Inputs are immutable saved records. Matching never consults receipt order or
// another revision to fill a missing minute in the selected snapshot.
export function createWeatherReplay(history={}){
  const weather=[...(history.weather??[])].sort((a,b)=>a.time-b.time);
  const presentations=[...(history.presentations??[])].sort((a,b)=>a.time-b.time),policies=[...(history.policies??[])].sort((a,b)=>a.time-b.time);
  const forecasts=[...(history.forecasts??[])].sort((a,b)=>a.time-b.time).map(s=>({...s,pointMap:new Map(s.points.map(p=>[p.time,p.precipitation]))}));
  function preceding(rows,time){let low=0,high=rows.length;while(low<high){const mid=(low+high)>>>1;if(rows[mid].time<=time)low=mid+1;else high=mid;}return rows[low-1]??null;}
  function estimate(time,lead=0){
    const boundary=time-lead*60,snapshot=preceding(forecasts,boundary);
    if(!snapshot||snapshot.time<boundary-600)return null;
    return snapshot.pointMap.get(time)??null;
  }
  return {
    weather(time,comparison=false){
      const r=preceding(weather,time),snapshot=preceding(presentations,time),policy=preceding(policies,time);
      const units=policy?.initialized?policy.units:history.baseline??defaultUnits;
      const owm={configured:true,source:'openweather',data:{current:r?.current??null,minutely:[]},fetchedAt:r?.receivedAt??null,gust:r?.gust??null,failures:0,error:null,units};
      if(!snapshot||comparison)return owm;
      // Use the observations known at the time, not observations received later
      // with older provider timestamps. Exact policy boundaries may fall between
      // polls; validate the retained raw values against the units then in force.
      const effective={...(policy??snapshot.policy),units};
      const recorded={...snapshot.owm,units};
      return {...recorded,presentation:{...snapshot,policy:effective,rows:selectHaReadings(effective,snapshot.observations,recorded,time*1000,{historical:true})}};
    },
    forecast(time){const s=preceding(forecasts,time);return s?.points.length&&s.points.at(-1).time>=time?s:null;},
    comparison(time,lead){if(![10,20,30,40,50,60].includes(lead))throw Error('Invalid comparison lead');return Array.from({length:13},(_,i)=>{const target=time-(12-i)*600;return {time:target,now:estimate(target),predicted:estimate(target,lead)};});},
  };
}
