import {grassControls} from '/grass-wetness-settings.js';
import {replayGrass,alignedGrass,observationComparison} from '/grass-replay.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let data,parameters,candidate=[],hours=72,selected=0,replayMs=0,frame=0;
const fmt=value=>Number.isFinite(value)?value.toFixed(1):'—';
const stamp=time=>new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(time);
const clock=time=>new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(time);
const error=message=>{$('error').textContent=message;$('error').hidden=!message;};
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function svg(tag,attributes,parent=$('chart')){const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attributes))node.setAttribute(k,v);parent.append(node);return node;}
function visibleWindow(){const end=Math.max(data.end,...data.observations.map(o=>o.observedAt));return {start:end-hours*3600000,end};}
function chart(){
  const {start,end}=visibleWindow(),left=38,right=Math.max(320,$('chart').clientWidth)-16,top=16,bottom=296,x=t=>left+(t-start)/(end-start)*(right-left),y=v=>bottom-v/5*(bottom-top);
  const root=$('chart');root.setAttribute('viewBox',`0 0 ${right+16} 340`);root.replaceChildren();
  const defs=svg('defs',{}),clip=svg('clipPath',{id:'plot-clip'},defs);svg('rect',{x:left,y:top,width:right-left,height:bottom-top},clip);
  for(let value=0;value<=5;value++){svg('line',{x1:left,x2:right,y1:y(value),y2:y(value),class:'chart-grid'});const label=svg('text',{x:left-13,y:y(value)+4,'text-anchor':'end',class:'chart-label'});label.textContent=value;}
  const ticks=right<500?2:6;
  for(let i=0;i<=ticks;i++){const time=start+(end-start)*i/ticks;svg('line',{x1:x(time),x2:x(time),y1:top,y2:bottom,class:'chart-grid',opacity:'.35'});const label=svg('text',{x:x(time),y:322,'text-anchor':i===0?'start':i===ticks?'end':'middle',class:'chart-label'});label.textContent=hours>24?stamp(time):clock(time);}
  const plot=svg('g',{'clip-path':'url(#plot-clip)'});
  for(const [points,klass] of [[data.recorded,'recorded-path'],[candidate,'candidate-path']]){
    let d='',last=null;
    for(const point of points){if(!Number.isFinite(point.value)){last=null;continue;}const move=!last||point.time-last.time>600000;d+=(move?'M':'L')+x(point.time).toFixed(2)+','+y(point.value).toFixed(2);last=point;}
    svg('path',{d,class:klass},plot);
  }
  for(const observation of data.observations.filter(o=>o.observedAt>=start&&o.observedAt<=end)){
    const circle=svg('circle',{cx:x(observation.observedAt),cy:y(observation.intensity),r:5.5,class:'observation-dot'},plot);
    const title=svg('title',{},circle);title.textContent=`${stamp(observation.observedAt)} · observed ${observation.intensity} · ${observation.note}`;
  }
  const at=data.samples[selected]?.time;
  if(at>=start&&at<=end){svg('line',{x1:x(at),x2:x(at),y1:top,y2:bottom,class:'cursor-line'});for(const [points,color]of [[data.recorded,'var(--recorded)'],[candidate,'var(--green)']]){const point=points[selected];if(Number.isFinite(point?.value))svg('circle',{cx:x(at),cy:y(point.value),r:4,fill:color});}}
}
function inspect(){
  const sample=data.samples[selected],rows=sample.snapshot.rows;
  $('cursor-time').textContent=stamp(sample.time);
  $('inspect-recorded').textContent=fmt(data.recorded[selected]?.value);
  $('inspect-candidate').textContent=fmt(candidate[selected]?.value);
  $('inspect-dew').textContent=`${fmt(rows.temperature.value)}° / ${fmt(rows.dew.value)}°`;
  $('inspect-wind').textContent=fmt(rows.wind.value)+' mph';
  $('inspect-solar').textContent=Math.round(rows.irradiance.value)+' W/m²';
}
function table(){
  const body=$('observations');body.replaceChildren();
  for(const o of [...data.observations].reverse()){
    const row=element('tr');row.append(element('td',stamp(o.observedAt)));
    const intensity=element('td');intensity.append(element('span',o.intensity,'intensity-chip'));row.append(intensity);
    row.append(element('td',fmt(alignedGrass(data.recorded,o.observedAt)?.value)),element('td',fmt(alignedGrass(candidate,o.observedAt)?.value),'accent'),element('td',o.note||'—'));body.append(row);
  }
  $('observation-count').textContent=data.observations.length+' entries';
}
function metrics(){
  const original=observationComparison(data.recorded,data.observations),alternative=observationComparison(candidate,data.observations);
  $('baseline-error').textContent=fmt(original.meanAbsoluteDifference);$('candidate-error').textContent=fmt(alternative.meanAbsoluteDifference);
  $('matched').textContent=alternative.count+' / '+data.observations.length;
  $('replay-duration').textContent=replayMs<1?'< 1 ms':Math.round(replayMs)+' ms';
  $('replay-count').textContent=data.samples.length+' inputs · browser calculation';
  $('comparison-note').textContent='Mean absolute difference · illustrative observations, not validation';
}
function recalculate(){
  const start=performance.now();candidate=replayGrass(data.samples,parameters);replayMs=performance.now()-start;
  chart();inspect();table();metrics();
  $('replay-note').textContent=`Replay starts ${stamp(data.start)} at moisture ${data.initialMoisture.toFixed(1)}. First 30 minutes warm up. Sliders apply to the entire replay; original values stay fixed.`;
}
function controls(){
  const host=$('sliders');
  for(const [key,label,hint,min,max]of grassControls){
    if(['rain','solar','sensitivity'].includes(key))host.append(element('div',key==='rain'?'WETTING':key==='solar'?'DRYING':'DISPLAY','slider-group'));
    const field=element('div',undefined,'slider-field'),title=element('label',label),output=element('output',parameters[key].toFixed(2)+'×');title.htmlFor='tune-'+key;output.id='value-'+key;title.append(output);
    const input=element('input');Object.assign(input,{id:'tune-'+key,type:'range',min:String(min),max:String(max),step:'0.05',value:String(parameters[key])});input.setAttribute('aria-describedby','hint-'+key);
    const detail=element('small',hint);detail.id='hint-'+key;field.append(title,input,detail);host.append(field);
    input.addEventListener('input',()=>{parameters[key]=Number(input.value);output.textContent=parameters[key].toFixed(2)+'×';cancelAnimationFrame(frame);frame=requestAnimationFrame(recalculate);});
  }

  $('reset').onclick=()=>{parameters={...data.parameters};for(const [key]of grassControls){$('tune-'+key).value=parameters[key];$('value-'+key).textContent=parameters[key].toFixed(2)+'×';}recalculate();};
  document.querySelectorAll('[data-hours]').forEach(button=>button.onclick=()=>{hours=Number(button.dataset.hours);document.querySelectorAll('[data-hours]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));chart();});
  new ResizeObserver(()=>chart()).observe($('chart').parentElement);
  $('cursor').max=data.samples.length-1;$('cursor').value=selected;$('cursor').oninput=()=>{selected=Number($('cursor').value);inspect();chart();};
  $('chart').addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;const rect=$('chart').getBoundingClientRect(),ratio=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*Math.max(320,rect.width)-38)/(Math.max(320,rect.width)-54))),{start,end}=visibleWindow(),at=start+ratio*(end-start);selected=Math.max(0,Math.min(data.samples.length-1,Math.round((at-data.start)/300000)));$('cursor').value=selected;inspect();chart();});
}
$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';};
$('export').onclick=()=>{
  if(!data)return;const blob=new Blob([JSON.stringify({...data,candidateParameters:parameters,candidate},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='grass-lab-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
try{const response=await fetch('/__grass-lab/data',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Lab data unavailable.');data=await response.json();parameters={...data.parameters};selected=data.samples.length-1;controls();recalculate();}catch(e){error(e.message+' Refresh to try again.');}
