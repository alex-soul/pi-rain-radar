import {defaultUnits,selectHaReadings,filterCurrent} from './weather-policy.js';
// Inputs are immutable saved records. Matching never consults receipt order or
// another revision to fill a missing minute in the selected snapshot.
export function createWeatherReplay(history={}){
  const weather=[...(history.weather??[])].sort((a,b)=>a.time-b.time);
  const presentations=[...(history.presentations??[])].sort((a,b)=>a.time-b.time),policies=[...(history.policies??[])].sort((a,b)=>a.time-b.time);
  const forecasts=[...(history.forecasts??[])].sort((a,b)=>a.time-b.time).map(s=>({...s,pointMap:new Map(s.points.map(p=>[p.time,p.precipitation]))}));
  function preceding(rows,time){let low=0,high=rows.length;while(low<high){const mid=(low+high)>>>1;if(rows[mid].time<=time)low=mid+1;else high=mid;}return rows[low-1]??null;}
  const observed=observedRainIntervals(history.rainObservations??presentations,history.context);

  return {
    weather(time,comparison=false){
      const r=preceding(weather,time),snapshot=preceding(presentations,time),policy=preceding(policies,time);
      const units=policy?.initialized?policy.units:history.baseline??defaultUnits;
      const owmPolicy=policy?{...policy,source:'openweather'}:null;
      const owm={configured:true,source:'openweather',policy:owmPolicy,data:{current:filterCurrent(r?.current,policy?.mappings),minutely:[]},fetchedAt:r?.receivedAt??null,gust:policy?.mappings?.gust==='disabled'?null:r?.gust??null,failures:0,error:null,units};
      if(!snapshot||comparison)return owm;
      // Use the observations known at the time, not observations received later
      // with older provider timestamps. Exact policy boundaries may fall between
      // polls; validate the retained raw values against the units then in force.
      const effective={...(policy??snapshot.policy),units};
      const recorded={...snapshot.owm,units,data:{...snapshot.owm?.data,current:filterCurrent(snapshot.owm?.data?.current,effective.mappings)},gust:effective.mappings?.gust==='disabled'?null:snapshot.owm?.gust};
      return {...recorded,presentation:{...snapshot,policy:effective,rows:selectHaReadings(effective,snapshot.observations,recorded,time*1000,{historical:true})}};
    },
    forecast(time){const s=preceding(forecasts,time);return s?.points.length&&s.points.at(-1).time>=time?s:null;},
    actualRain(start,end){
      const intervals=observed.filter(p=>p.rate!==null&&p.start>=start&&p.end<=end);
      const seconds=intervals.reduce((n,p)=>n+p.end-p.start,0);
      const reasons=[...new Set(observed.filter(p=>p.rate===null&&p.end>start&&p.start<end).map(p=>p.reason))];
      return {intervals,seconds,span:end-start,reasons};
    },
  };
}

// Counter differences describe acquisition intervals, not minute measurements.
// Preserve invalid samples as breaks and never bridge uncertain counter changes.
export function observedRainIntervals(records,context){
  const result=[];let previous=null;
  for(const row of [...records].sort((a,b)=>a.time-b.time)){
    const rain=row.observedRain,at=rain?.receivedAt/1000;
    const factor={mm:1,cm:10,in:25.4}[rain?.unit];
    const valid=!!rain?.eligible&&rain.source==='ha'&&!!rain.entity&&factor&&Number.isFinite(rain.value)&&Number.isFinite(rain.value*factor)&&rain.value>=0&&['total','total_increasing'].includes(rain.stateClass)&&rain.basis==='ha-acquired-total'&&Number.isFinite(at)&&at<=row.time&&row.time-at<=600&&Number.isFinite(rain.reportedAt)&&rain.reportedAt<=rain.receivedAt&&(!row.location||row.location===context);
    const time=valid?at:row.time;
    const current={time,total:valid?rain.value*factor:null,rain,valid:!!valid,key:JSON.stringify([row.location??context,row.connectionRevision??null,rain?.entity,rain?.unit,rain?.stateClass]),reason:row.location&&row.location!==context?'Location changed':rain?.reason||'Invalid or missing acquisition'};
    if(previous&&time<previous.time){previous={...current,time:Math.max(previous.time,row.time),valid:false,reason:'Out-of-order acquisition'};continue;}
    if(previous&&time===previous.time){
      // Presentation writes may repeat one acquisition after an OWM/settings event.
      if(current.valid&&previous.valid&&current.key===previous.key&&current.total===previous.total&&rain.resetAt===previous.rain.resetAt)continue;
      previous={...current,valid:false,reason:'Conflicting acquisition'};continue;
    }
    if(previous&&time>previous.time){
      let reason=!previous.valid?previous.reason:!current.valid?current.reason:time-previous.time>600?'Acquisition gap':current.key!==previous.key?'Source or unit changed':null;
      if(!reason&&rain.reportedAt<previous.rain.reportedAt)reason='Report timestamp moved backwards';
      let amount=current.total-previous.total;
      if(!reason&&(rain.resetAt!==previous.rain.resetAt||amount<0)){
        const reset=rain.resetAt;
        if(Number.isFinite(reset)&&reset>previous.time*1000&&reset<=time*1000&&Number.isFinite(rain.previousPeriod)&&rain.previousPeriod>=0){amount=rain.previousPeriod*factor-previous.total+current.total;if(amount<0)reason='Invalid reset metadata';}
        else reason='Unresolved counter reset';
      }
      if(!reason&&(!Number.isFinite(amount)||!Number.isFinite(amount*3600/(time-previous.time))))reason='Invalid counter difference';
      if(!reason&&amount>0&&rain.reportedAt<=previous.time*1000)reason='Delayed rain report';
      result.push({start:previous.time,end:time,rate:reason?null:amount*3600/(time-previous.time),reason,entity:rain?.entity,reportedAt:rain?.reportedAt,previousReportedAt:previous.rain?.reportedAt});
    }
    previous=current;
  }
  return result;
}
