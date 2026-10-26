import {formatTime} from './time.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let signature='';
export function paintHistoricalForecast(replay,time,showActual,timeZone){
  const snapshot=replay.forecast(time),start=snapshot?.time??time,end=snapshot?.points.at(-1).time??time+3600;
  const observed=replay.actualRain(start,end);
  const key=JSON.stringify([timeZone,showActual,snapshot?.time,snapshot?.points,observed,snapshot?null:time]);if(signature===key)return;signature=key;
  const stamp=t=>formatTime(t,{hour:'2-digit',minute:'2-digit'},timeZone),nodes=[];
  const add=(tag,attributes,title)=>{const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attributes))node.setAttribute(k,String(v));if(title){const tip=document.createElementNS(ns,'title');tip.textContent=title;node.append(tip);}nodes.push(node);};
  const points=Array.from({length:Math.floor((end-start)/60)+1},(_,i)=>({time:start+i*60,value:snapshot?.pointMap.get(start+i*60)??null}));
  // Always include retained observations in the scale, including when hidden.
  const scale=Math.max(5,Math.ceil(Math.max(0,...points.map(p=>p.value??0),...observed.intervals.map(p=>p.rate))/5)*5),width=360/points.length;
  points.forEach((p,i)=>{
    const missing=p.value===null,height=missing||p.value===0?1:Math.max(2,p.value/scale*85);
    add('rect',{x:i*width+1,y:85-height,width:Math.max(1,width-2),height,fill:missing?'#c49343':p.value<.5?'#75c8bd':'#329db3'},`${stamp(p.time)} · Forecast: ${missing?'Missing':`${p.value} mm/h`}`);
  });
  if(showActual&&snapshot){
    const dots=observed.intervals.map(p=>({...p,x:(((p.start+p.end)/2-start)/60+.5)*width,y:85-p.rate/scale*85}));
    // Share tangents through consecutive points instead of flattening at every dot.
    // Each contiguous run is independent, so missing observations remain gaps.
    let run=[];
    const flush=()=>{if(run.length>1)add('path',{d:smoothRainPath(run),fill:'none',stroke:'var(--forecast-comparison)','stroke-width':2,'stroke-linecap':'round',class:'observed-rain-curve'});};
    for(const p of dots){
      if(run.length&&p.start!==run.at(-1).end){flush();run=[];}
      run.push(p);
    }
    flush();
    for(const p of dots)add('circle',{cx:p.x,cy:p.y,r:2.5,fill:'var(--forecast-comparison)',class:'observed-rain-point'},`${stamp(p.start)}–${stamp(p.end)} · Observed average ${Number(p.rate.toPrecision(3))} mm/h · HA acquisition interval, not minute intensity. Last HA report ${new Date(p.reportedAt).toISOString()}. Hindsight.`);
  }
  $('minute-bars').replaceChildren(...nodes);$('minute-chart').setAttribute('viewBox','0 0 360 85');$('minute-chart').style.visibility='visible';
  document.querySelectorAll('.minute-axis span').forEach((node,i)=>{node.textContent=stamp(start+(end-start)*i/4);});
  const coverage=observed.seconds?`${Math.round(observed.seconds/60)} / ${Math.round(observed.span/60)} min covered${observed.seconds<observed.span?' · gaps':''}`:'unavailable';
  const label=snapshot?`Forecast · ${stamp(snapshot.time)} · 0–${scale} mm/h`:'Forecast · no saved data';
  $('minute-y-top').textContent=String(scale);$('minute-y-middle').textContent=String(scale/2);
  $('rain-forecast').setAttribute('aria-label','Historical precipitation forecast');$('minute-message').hidden=true;
  const detail=`${label}. Original minute forecast bars, earlier to later. ${snapshot?`Saved ${Number.isFinite(snapshot.receivedAt)?new Date(snapshot.receivedAt).toISOString():'at an unavailable receipt time'}; first-point reference ${stamp(snapshot.time)}.`:''} Purple dots at interval midpoints show average mm/h between compatible Home Assistant acquisitions, usually five minutes. The smooth connecting line is a visual guide, not additional measurements; reporting lag means exact rainfall timing is unknown. ${showActual?(snapshot?`Observed average: ${coverage}.`:'No saved forecast to compare.'):'Actual rainfall off.'} Retained later observations are hindsight. Gaps, unmatched boundaries and future periods are unknown, never zero. ${observed.reasons.join('; ')}. Scale includes available observations whether shown or hidden.`;
  $('minute-chart').setAttribute('aria-label',detail);$('rain-forecast').title=detail;
}
export function resetHistoricalForecast(){signature='';$('rain-forecast').setAttribute('aria-label','Current minute precipitation forecast');$('rain-forecast').removeAttribute('title');document.querySelectorAll('.minute-axis span').forEach((node,i)=>{node.textContent=i?`+${i*15} min`:'NOW';});}

function smoothRainPath(points){
  const widths=points.slice(1).map((p,i)=>p.x-points[i].x);
  const slopes=points.slice(1).map((p,i)=>(p.y-points[i].y)/widths[i]);
  // Monotone cubic interpolation: flatten only at actual peaks, troughs or plateaus.
  // The weighted harmonic mean prevents overshoot, including uneven acquisition intervals.
  const tangents=points.map((p,i)=>{
    if(!i)return slopes[0];
    if(i===points.length-1)return slopes.at(-1);
    const left=slopes[i-1],right=slopes[i];
    if(left*right<=0)return 0;
    const w1=2*widths[i]+widths[i-1],w2=widths[i]+2*widths[i-1];
    return (w1+w2)/(w1/left+w2/right);
  });
  let path=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],third=widths[i-1]/3;
    path+=` C ${a.x+third} ${a.y+third*tangents[i-1]} ${b.x-third} ${b.y-third*tangents[i]} ${b.x} ${b.y}`;
  }
  return path;
}
