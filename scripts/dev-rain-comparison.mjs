// Disposable acquisition records; never contacts HA or rewrites saved forecasts.
export function rainComparisonFixture(data,scenario,end){
  if(!data.weatherHistory)return data;
  const context=data.weatherHistory.context,records=[];let total=0,resetAt=(end-86400)*1000;
  if(scenario!=='rain-unavailable')for(let time=end-86400;time<=end;time+=300){
    const slot=Math.round((time-(end-86400))/300),phase=slot%12;
    const rate=[0,0,1.2,3.6,7.2,9.6,6,2.4,1.2,0,0,0][phase];
    total+=rate/12;
    if(scenario==='rain-boundaries'&&phase===4){total=0;resetAt=time*1000;}
    const missing=scenario==='rain-boundaries'&&[7,8].includes(phase);
    const unit=scenario==='rain-boundaries'&&phase===10?'cm':'mm';
    records.push({time,location:context,connectionRevision:0,observedRain:{source:'ha',entity:scenario==='rain-boundaries'&&phase===11?'sensor.other_rain_total':'sensor.demo_rain_total',value:total/(unit==='cm'?10:1),unit,stateClass:'total_increasing',basis:'ha-acquired-total',time:time*1000,receivedAt:time*1000,reportedAt:time*1000,resetAt,previousPeriod:null,eligible:!missing,reason:missing?'Synthetic missing acquisition':null}});
  }
  const forecasts=(data.weatherHistory.forecasts??[]).map(s=>({...s,points:s.points.map(p=>{const minute=(p.time-s.time)/60;return {...p,precipitation:Math.round(Math.max(0,4.2*Math.exp(-(((minute-24)/15)**2))-.15)*10)/10};})}));
  return {...data,weatherHistory:{...data.weatherHistory,forecasts,rainObservations:records}};
}
