import {aviationDetail} from './aviation-model.js';
import {weatherReadings} from './weather-readings.js';

export function integrationHealth(status,now=Date.now()){
  const state=status?.aviation;
  const products=['metar','taf'].map(p=>aviationDetail(state??{unknown:true},p,now));
  const levels=products.map(p=>p.health),ready=levels.filter(v=>v==='ready').length;
  const label=!state?'Waiting':!state.enabled?'Disabled':ready===2?'Ready':ready?'Partially usable':levels.includes('warning')?'Retained / delayed':levels.every(v=>v==='pending')?'Waiting':'Unavailable';
  const aviation={label,health:ready===2?'ready':!state||!state.enabled?'neutral':ready||levels.includes('warning')||levels.includes('pending')?'warning':'error',products,detail:products.map(p=>`${p.label}: ${p.description}`).join(' · ')};
  const reading=weatherReadings(status?.weather,now).grassWetness;
  const grass={reading,label:({ready:'Ready · uncalibrated',disabled:'Disabled',setup:'Setup required',warming:'Warming up',unavailable:'Unavailable / stale'})[reading.status],health:reading.status==='ready'?'ready':['disabled','setup'].includes(reading.status)?'neutral':reading.status==='warming'?'warning':'error',detail:reading.reason};
  return {aviation,grass};
}
export function paintIntegrationHealth(status,now,stale=false){
  const health=integrationHealth(status,now);
  for(const key of ['aviation','grass']){
    const node=document.getElementById(`review-${key}-health`);if(!node)continue;
    node.textContent=stale?'Offline / stale':health[key].label;node.dataset.health=stale?'error':health[key].health;
    node.title=health[key].detail;node.setAttribute('aria-label',health[key].label+'. '+health[key].detail);
  }
}
