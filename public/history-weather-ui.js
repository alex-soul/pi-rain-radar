import {formatTime} from './time.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let signature='';
export function paintHistoricalForecast(replay,time,lead,timeZone){
  const snapshot=lead?null:replay.forecast(time),pairs=lead?replay.comparison(time,lead):null;
  const key=JSON.stringify([timeZone,lead,snapshot?.time,snapshot?.points,pairs,!lead&&!snapshot?time:null]);if(signature===key)return;signature=key;
  const stamp=t=>formatTime(t,{hour:'2-digit',minute:'2-digit'},timeZone),nodes=[];
  const add=(tag,attributes,title)=>{const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attributes))node.setAttribute(k,String(v));if(title){const tip=document.createElementNS(ns,'title');tip.textContent=title;node.append(tip);}nodes.push(node);};
  const points=lead?pairs:snapshot?Array.from({length:Math.floor((snapshot.points.at(-1).time-snapshot.time)/60)+1},(_,i)=>({time:snapshot.time+i*60,now:snapshot.pointMap.get(snapshot.time+i*60)??null})):Array.from({length:61},(_,i)=>({time:time+i*60,now:null}));
  const estimates=lead?[10,20,30,40,50,60].flatMap(value=>replay.comparison(time,value).flatMap(p=>[p.now??0,p.predicted??0])):points.map(p=>p.now??0);
  const scale=Math.max(5,...estimates),width=360/points.length;
  let previous=null;
  points.forEach((p,i)=>{
    const missing=p.now===null,height=missing||p.now===0?1:Math.max(2,p.now/scale*85),x=(i+.5)*width;
    add('rect',{x:i*width+1,y:85-height,width:Math.max(1,width-2),height,fill:missing?'#c49343':p.now<.5?'#75c8bd':'#329db3'},`${stamp(p.time)} · ${missing?'Missing':`${p.now} mm/h`}${lead?' · NOW estimate':''}`);
    if(!lead)return;
    if(p.predicted===null){add('line',{x1:x-2,x2:x+2,y1:84,y2:84,stroke:'#c49343','stroke-width':2});previous=null;return;}
    const y=85-p.predicted/scale*85;
    if(previous)add('line',{x1:previous.x,y1:previous.y,x2:x,y2:y,stroke:'var(--forecast-comparison)','stroke-width':1.5});
    add('circle',{cx:x,cy:y,r:1.8,fill:'var(--forecast-comparison)'},`${stamp(p.time)} · Predicted ${lead} min earlier: ${p.predicted} mm/h`);previous={x,y};
  });
  $('minute-bars').replaceChildren(...nodes);$('minute-chart').setAttribute('viewBox','0 0 360 85');$('minute-chart').style.visibility='visible';
  const start=lead?time-7200:snapshot?.time??time,span=lead?7200:snapshot?Math.max(60,snapshot.points.at(-1).time-snapshot.time):3600;
  document.querySelectorAll('.minute-axis span').forEach((node,i)=>{node.textContent=stamp(start+span*i/4);});
  const label=lead?`Bars: NOW estimate · Line: ${lead} min earlier`:snapshot?'Saved forward forecast':'No saved forecast';
  $('rain-forecast').setAttribute('aria-label','Historical precipitation forecast');
  $('forecast-caption').hidden=true;
  $('minute-message').hidden=true;
  const detail=lead?`${label}. Bars show provider estimates, not measured rain. Line shows an earlier prediction. Missing history stays amber.`:`${label}${snapshot?` starting ${stamp(snapshot.time)} (approximate anchor)`:''}. Missing minutes stay amber.`;
  $('minute-chart').setAttribute('aria-label',detail);$('rain-forecast').title=detail;
}
export function resetHistoricalForecast(){signature='';$('rain-forecast').setAttribute('aria-label','Current minute precipitation forecast');$('forecast-caption').hidden=true;document.querySelectorAll('.minute-axis span').forEach((node,i)=>{node.textContent=i?`+${i*15} min`:'NOW';});}
