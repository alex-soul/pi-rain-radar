import {plotPoints} from './grass-plot.js';
import {grassControls} from '/grass-wetness-settings.js';
import {readingValues} from '/reading-units.js';
import {alignedGrass,observationComparison} from '/grass-replay.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let resizeObserver=null;
let worker=new Worker('/grass-lab-worker.js',{type:'module'}),busy=false,queued=false,requestId=0,loaded=false;
let data,parameters,candidate=[],hours=72,selected=0,replayMs=0,frame=0,recordedMode=false;
const fmt=value=>Number.isFinite(value)?value.toFixed(1):'—';
const stamp=time=>new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:data?.timeZone}).format(time);
const clock=time=>new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',timeZone:data?.timeZone}).format(time);
const error=message=>{$('error').textContent=message;$('error').hidden=!message;};
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function svg(tag,attributes,parent=$('chart')){const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attributes))node.setAttribute(k,v);parent.append(node);return node;}
function visibleWindow(){const end=Math.max(data.end,...data.observations.map(o=>o.observedAt));return {start:end-hours*3600000,end};}
function chart(){
  if(!data?.samples.length)return;
  const {start,end}=visibleWindow(),left=38,right=Math.max(320,$('chart').clientWidth)-16,top=16,bottom=296,x=t=>left+(t-start)/(end-start)*(right-left),y=v=>bottom-v/5*(bottom-top);
  const root=$('chart');root.setAttribute('viewBox',`0 0 ${right+16} 340`);root.replaceChildren();
  const defs=svg('defs',{}),clip=svg('clipPath',{id:'plot-clip'},defs);svg('rect',{x:left,y:top,width:right-left,height:bottom-top},clip);
  for(let value=0;value<=5;value++){svg('line',{x1:left,x2:right,y1:y(value),y2:y(value),class:'chart-grid'});const label=svg('text',{x:left-13,y:y(value)+4,'text-anchor':'end',class:'chart-label'});label.textContent=value;}
  const ticks=right<500?2:6;
  for(let i=0;i<=ticks;i++){const time=start+(end-start)*i/ticks;svg('line',{x1:x(time),x2:x(time),y1:top,y2:bottom,class:'chart-grid',opacity:'.35'});const label=svg('text',{x:x(time),y:322,'text-anchor':i===0?'start':i===ticks?'end':'middle',class:'chart-label'});label.textContent=hours>24?stamp(time):clock(time);}
  const plot=svg('g',{'clip-path':'url(#plot-clip)'});
  for(const [points,klass] of [[data.recorded,'recorded-path'],[candidate,'candidate-path']]){
    let d='',last=null;
    for(const point of plotPoints(points,start,end,right-left)){if(!Number.isFinite(point.value)){last=null;continue;}const move=!last||point.breakBefore;d+=(move?'M':'L')+x(point.time).toFixed(2)+','+y(point.value).toFixed(2);last=point;}
    svg('path',{d,class:klass},plot);
  }
  for(const observation of data.observations.filter(o=>o.observedAt>=start&&o.observedAt<=end)){
    const circle=svg('circle',{cx:x(observation.observedAt),cy:y(observation.intensity),r:5.5,class:'observation-dot'},plot);
    const title=svg('title',{},circle);title.textContent=`${stamp(observation.observedAt)} · observed ${observation.intensity} · ${observation.note}`;
  }
  for(const marker of data.markers??[]){if(marker.time<start||marker.time>end)continue;const line=svg('line',{x1:x(marker.time),x2:x(marker.time),y1:top,y2:bottom,stroke:'var(--amber)','stroke-dasharray':'3 5',opacity:'.7'},plot);svg('title',{},line).textContent=stamp(marker.time)+' · '+marker.label;}
  const at=data.samples[selected]?.time;
  if(at>=start&&at<=end){svg('line',{x1:x(at),x2:x(at),y1:top,y2:bottom,class:'cursor-line'});for(const [points,color]of [[data.recorded,'var(--recorded)'],[candidate,'var(--green)']]){const point=points[selected];if(Number.isFinite(point?.value))svg('circle',{cx:x(at),cy:y(point.value),r:4,fill:color});}}
}
function inspect(){
  const sample=data.samples[selected],rows=sample.snapshot.rows;
  const value=key=>{const row=rows[key];return row?.source&&Number.isFinite(row.value)?readingValues(row.value,key,row.source,row.unit,{}).canonicalValue:null;};
  $('cursor-time').textContent=stamp(sample.time);
  $('inspect-recorded').textContent=fmt(data.recorded[selected]?.value);
  $('inspect-candidate').textContent=fmt(candidate[selected]?.value);
  $('inspect-dew').textContent=`${fmt(value('temperature'))}° / ${fmt(value('dew'))}°`;
  $('inspect-wind').textContent=fmt(value('wind'))+' mph';
  $('inspect-solar').textContent=(Number.isFinite(value('irradiance'))?Math.round(value('irradiance')):'—')+' W/m²';
}
function table(){
  const body=$('observations');body.replaceChildren();
  for(const o of [...data.observations].reverse().slice(0,200)){
    const row=element('tr');row.append(element('td',stamp(o.observedAt)));
    const intensity=element('td');intensity.append(element('span',o.intensity,'intensity-chip'));row.append(intensity);
    row.append(element('td',fmt(alignedGrass(data.recorded,o.observedAt)?.value)),element('td',fmt(alignedGrass(candidate,o.observedAt)?.value),'accent'),element('td',o.note||'—'));body.append(row);
  }
  $('observation-count').textContent=data.observations.length+' entries'+(data.observations.length>200?' · latest 200 shown':'');
}
function metrics(){
  const original=observationComparison(data.recorded,data.observations),alternative=observationComparison(candidate,data.observations);
  $('baseline-error').textContent=fmt(original.meanAbsoluteDifference);$('candidate-error').textContent=fmt(alternative.meanAbsoluteDifference);
  $('matched').textContent=alternative.count+' / '+data.observations.length;
  $('replay-duration').textContent=replayMs<1?'< 1 ms':Math.round(replayMs)+' ms';
  $('replay-count').textContent=data.samples.length+' inputs · browser background worker';
  $('comparison-note').textContent=data.synthetic?'Mean absolute difference · illustrative observations, not validation':'Mean absolute difference · a small observation sample';
}
function paintReplay(){
  chart();inspect();table();metrics();
  $('candidate-label').textContent=recordedMode?'Replay · recorded settings':'Your alternative';
  $('experiment-mode').textContent=recordedMode?'Following recorded settings changes. Sliders show the latest recorded values.':'One alternative profile across the retained history.';
  const v=data.validation;
  $('replay-note').textContent=v?.mismatches?`Replay could not reproduce ${v.mismatches} saved estimates. Treat alternatives as unverified; export this dataset for investigation.`:v?.verified?`Verified baseline: ${v.compared.toLocaleString()} recorded estimates match. Replay starts from the retained boundary state. Original estimates and observations stay fixed.`:'Verifying the original calculation in your browser…';
}
function recalculate(){
  if(!data?.samples.length)return;
  if(busy){queued=true;return;}busy=true;
  $('replay-duration').textContent='…';
  worker.postMessage({id:++requestId,parameters:recordedMode?null:parameters,...(!loaded?{data:{samples:data.samples,recorded:data.recorded,initialState:data.initialState}}:{})});loaded=true;
}
worker.onmessage=event=>{
  const result=event.data;busy=false;
  if(result.error){error(result.error);return;}
  if(result.validation)data.validation={...result.validation,verified:result.validation.mismatches===0};
  if(queued){queued=false;recalculate();return;}
  candidate=result.points;replayMs=result.ms;paintReplay();
};
worker.onerror=()=>{busy=false;error('Replay could not start. Refresh this page to try again.');};
function controls(){
  const host=$('sliders');
  for(const [key,label,hint,min,max]of grassControls){
    if(['rain','solar','sensitivity'].includes(key))host.append(element('div',key==='rain'?'WETTING':key==='solar'?'DRYING':'DISPLAY','slider-group'));
    const field=element('div',undefined,'slider-field'),title=element('label',label),output=element('output',parameters[key].toFixed(2)+'×');title.htmlFor='tune-'+key;output.id='value-'+key;title.append(output);
    const input=element('input');Object.assign(input,{id:'tune-'+key,type:'range',min:String(min),max:String(max),step:'0.05',value:String(parameters[key])});input.setAttribute('aria-describedby','hint-'+key);
    const detail=element('small',hint);detail.id='hint-'+key;field.append(title,input,detail);host.append(field);
    input.addEventListener('input',()=>{recordedMode=false;parameters[key]=Number(input.value);output.textContent=parameters[key].toFixed(2)+'×';clearTimeout(frame);frame=setTimeout(recalculate,100);});
  }

  $('reset').onclick=()=>{recordedMode=!data.synthetic;parameters={...data.parameters};for(const [key]of grassControls){$('tune-'+key).value=parameters[key];$('value-'+key).textContent=parameters[key].toFixed(2)+'×';}recalculate();};
  document.querySelectorAll('[data-hours]').forEach(button=>button.onclick=()=>{hours=Number(button.dataset.hours);document.querySelectorAll('[data-hours]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));chart();});
  resizeObserver?.disconnect();resizeObserver=new ResizeObserver(()=>chart());resizeObserver.observe($('chart').parentElement);
  $('cursor').max=data.samples.length-1;$('cursor').value=selected;$('cursor').oninput=()=>{selected=Number($('cursor').value);inspect();chart();};
  $('chart').onpointermove=event=>{if(event.pointerType==='touch')return;const rect=$('chart').getBoundingClientRect(),ratio=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*Math.max(320,rect.width)-38)/(Math.max(320,rect.width)-54))),{start,end}=visibleWindow(),at=start+ratio*(end-start);selected=Math.max(0,Math.min(data.samples.length-1,nearestSample(at)));$('cursor').value=selected;inspect();chart();};
}
function nearestSample(at){let low=0,high=data.samples.length-1;while(low<high){const mid=Math.floor((low+high)/2);if(data.samples[mid].time<at)low=mid+1;else high=mid;}return low>0&&at-data.samples[low-1].time<data.samples[low].time-at?low-1:low;}
function datasetLabels(){
  if(data.synthetic){$('dataset-notice').textContent='Illustrative weather and observations · isolated from your Pi · changes here never tune the live model.';return;}
  hours=168;document.querySelectorAll('[data-hours]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.hours)===hours)));
  $('dataset-notice').textContent=`Recorded history through ${stamp(data.end)} · loaded ${stamp(data.capturedAt)} · up to 30 days retained. Experiments do not change live settings.`;
  $('observations-note').textContent=`${data.observations.filter(o=>o.source?.type==='spreadsheet').length} observations imported from your spreadsheet. Times are ${data.timeZone}, accurate to the minute. Comparison uses the last available estimate at or before that time, within 10 minutes. Observations are saved on this installation. Refresh history to include new entries.`;
  $('tuning-note').textContent='Move a slider to apply one alternative profile across all retained inputs. Reset replays the original settings changes.';
  $('dataset-markers').textContent=(data.markers??[]).map(m=>`${stamp(m.time)} · ${m.label} (tracker note)`).join(' · ');
}
$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';};
$('export').onclick=()=>{
  if(!data)return;const blob=new Blob([JSON.stringify({...data,candidateParameters:parameters,candidate},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='grass-lab-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function loadHistory(){
  $('refresh').disabled=true;
  try{
    const response=await fetch('/api/grass-lab/data',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Lab history unavailable.');data=await response.json();
    parameters={...data.parameters};selected=data.samples.length-1;recordedMode=true;loaded=false;candidate=[];error('');
    if(!data.samples.length){$('dataset-notice').textContent='No retained weather inputs yet. You can already save observations at /grass-obs.';table();metrics();return;}
    datasetLabels();$('sliders').replaceChildren();controls();recalculate();
  }catch(e){error(e.message+' Refresh to try again.');}finally{$('refresh').disabled=false;}
}
$('refresh').onclick=()=>{if(!busy)void loadHistory();};
void loadHistory();
