import {getPosition,getTimes,getMoonPosition,getMoonTimes,getMoonIllumination} from './suncalc.js';
const day=86400000;
const epoch=value=>value instanceof Date&&Number.isFinite(+value)?+value:null;
export const bearing=value=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(value/22.5)%16];
function maximum(start,end,position){
 let peak=start;for(let t=start;t<=end;t+=1800000)if(position(t).altitude>position(peak).altitude)peak=t;
 let a=Math.max(start,peak-1800000),b=Math.min(end,peak+1800000);
 for(let i=0;i<26;i++){const l=a+(b-a)/3,r=b-(b-a)/3;if(position(l).altitude<position(r).altitude)a=l;else b=r;}
 return (a+b)/2;
}
export function createAstronomy(lat,lon){
 let cacheKey=null,cache;
 return function at(time){
  if(!Number.isFinite(time)||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
  const utcDay=Math.floor(time/day)*day;
  if(cacheKey!==utcDay){
   cacheKey=utcDay;cache={sun:[],moon:[]};
   for(let offset=-2;offset<=2;offset++){
    const date=new Date(utcDay+offset*day),sun=getTimes(date,lat,lon),moon=getMoonTimes(date,lat,lon);
    for(const [body,data,keys] of [['sun',sun,[['rise','sunrise'],['transit','solarNoon'],['set','sunset']]],['moon',moon,[['rise','rise'],['set','set']]]])for(const [type,key]of keys){const t=epoch(data[key]);if(t!==null&&!cache[body].some(e=>e.type===type&&Math.abs(e.time-t)<1000))cache[body].push({type,time:t});}
   }
   cache.sun.sort((a,b)=>a.time-b.time);cache.moon.sort((a,b)=>a.time-b.time);
   const lunarPosition=t=>getMoonPosition(new Date(t),lat,lon);
   const peaks=[];
   for(let offset=-1;offset<=1;offset++){
    const start=utcDay+offset*day,peak=maximum(start,start+day,lunarPosition);
    if(peak>start+1000&&peak<start+day-1000&&!peaks.some(t=>Math.abs(t-peak)<3600000))peaks.push(peak);
   }
   cache.moon.push(...peaks.map(time=>({type:'transit',time})));cache.moon.sort((a,b)=>a.time-b.time);
  }
  const result={time};
  for(const [body,position]of [['sun',getPosition],['moon',getMoonPosition]]){
   const pos=position(new Date(time),lat,lon),events=cache[body];
   const before=events.filter(e=>e.type!=='transit'&&e.time<=time).at(-1),next=events.find(e=>e.type!=='transit'&&e.time>time);
   const up=before?before.type==='rise':next?next.type==='set':pos.altitude>0;
   const rise=up&&before?.type==='rise'?before:events.find(e=>e.type==='rise'&&e.time>time);
   const set=rise?events.find(e=>e.type==='set'&&e.time>rise.time):null;
   const transit=rise&&set?events.find(e=>e.type==='transit'&&e.time>=rise.time&&e.time<=set.time):events.filter(e=>e.type==='transit').reduce((best,e)=>!best||Math.abs(e.time-time)<Math.abs(best.time-time)?e:best,null);
   const continuous=up&&(!rise||!set||!(before?.type==='rise'));
   const progress=up&&rise&&set&&!continuous?(time-rise.time)/(set.time-rise.time):((time-(transit?.time??utcDay)+day/2)%day+day)%day/day;
   result[body]={...pos,up,continuous,progress:Math.max(0,Math.min(1,progress)),rise:rise?.time??null,set:set?.time??null,transit:transit?.time??null,next:events.find(e=>e.time>time)??null};
  }
  result.moon.illumination=getMoonIllumination(new Date(time));return result;
 };
}
