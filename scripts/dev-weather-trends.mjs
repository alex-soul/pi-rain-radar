import {defaultUnits} from '../public/weather-policy.js';
export function trendFixture(data){
 const {start,end}=data,weather=[],presentations=[],policies=[];
 const steps=Math.round((end-start)/300);
 for(let i=0;i<=steps;i++){
  const time=start+i*300,phase=i/steps,ha=phase>.55&&phase<.8,missing=phase>.25&&phase<.45;
  const current={time,temperature:14+3*Math.sin(i/5),dewPoint:7+2*Math.sin(i/7),humidity:60+20*Math.cos(i/8),feelsLike:12+3*Math.sin(i/5),windMph:10+i%7,pressure:1012+i%3,windDirection:225,visibility:10000,uvi:2};
  const policy={time,initialized:true,units:defaultUnits,source:ha?'ha':'openweather',fallback:false,owmCollect:true,haCollect:true,rainAccumulation:'sensor.demo_rain_total',mappings:{temperature:ha?'sensor.demo_temperature':'owm'}};
  const owm={configured:true,fetchedAt:time*1000,data:{current:missing?{time}:current},failures:0};
  weather.push({time,receivedAt:time*1000,current:owm.data.current});policies.push(policy);
  presentations.push({time,policy,owm,observations:ha?{'sensor.demo_temperature':{time:time*1000,receivedAt:time*1000,value:current.temperature+1,unit:'C',basis:'ha-reported',attribution:'Synthetic Home Assistant'}}:{}});
  const resetAt=new Date(time*1000).setUTCHours(0,0,0,0),hours=(time*1000-resetAt)/3600000;
  presentations.at(-1).observations['sensor.demo_rain_total']={time:time*1000,receivedAt:time*1000,value:missing?null:Math.floor(hours*2)*.25,unit:'mm',stateClass:'total_increasing',resetAt,reason:missing?'HA reading unavailable':null,attribution:'Synthetic Home Assistant'};
 }
 const latest=presentations.at(-1),now=Date.now(),live={...latest,observations:{...latest.observations,'sensor.demo_rain_total':{...latest.observations['sensor.demo_rain_total'],time:now,receivedAt:now}}};
 return {...data,weather:{...data.weather,presentation:live},weatherHistory:{weather,presentations,policies,baseline:defaultUnits}};
}
