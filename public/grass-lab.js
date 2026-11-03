import {grassFactors,effectBins,effectOpacity} from './grass-effects.js';
import {plotPoints} from './grass-plot.js';
import {grassControls,validateGrassSettings} from '/grass-wetness-settings.js';
import {readingValues} from '/reading-units.js';
import {alignedGrass,observationComparison} from '/grass-replay.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let resizeObserver=null;
let worker=new Worker('/grass-lab-worker.js',{type:'module'}),busy=false,queued=false,requestId=0,loaded=false;
let data,parameters,candidate=[],hours=72,selected=0,replayMs=0,frame=0;
const activeEffects=new Set();
let bins=[];
const plotLeft=88,plotRight=16;
const fmt=value=>Number.isFinite(value)?value.toFixed(1):'—';
const stamp=time=>new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:data?.timeZone}).format(time);
const clock=time=>new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',timeZone:data?.timeZone}).format(time);
const error=message=>{$('error').textContent=message;$('error').hidden=!message;};
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function svg(tag,attributes,parent=$('chart')){const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attributes))node.setAttribute(k,v);parent.append(node);return node;}
function visibleWindow(){const end=Math.max(data.end,...data.observations.map(o=>o.observedAt));return {start:end-hours*3600000,end};}
function chart(){
  if(!data?.samples.length)return;
  const {start,end}=visibleWindow(),left=plotLeft,right=Math.max(240,$('chart').clientWidth)-plotRight,top=16,bottom=296,x=t=>left+(t-start)/(end-start)*(right-left),y=v=>bottom-v/5*(bottom-top);
  const root=$('chart');root.setAttribute('viewBox',`0 0 ${right+16} 340`);root.replaceChildren();
  const defs=svg('defs',{}),clip=svg('clipPath',{id:'plot-clip'},defs);svg('rect',{x:left,y:top,width:right-left,height:bottom-top},clip);
  const pattern=svg('pattern',{id:'effect-missing',width:6,height:6,patternUnits:'userSpaceOnUse'},defs);svg('path',{d:'M0,6 L6,0',stroke:'var(--muted)','stroke-width':1,opacity:'.25'},pattern);
  const selectedFactors=grassFactors.filter(f=>activeEffects.has(f.key));
  for(const [index,factor]of selectedFactors.entries()){
    const layer=svg('g',{'clip-path':'url(#plot-clip)','data-effect-overlay':factor.key});
    for(const bin of bins){const attrs={x:x(bin.start),y:top,width:x(bin.end)-x(bin.start)+.15,height:bottom-top};
      if(index===0&&bin.coverage<.99)svg('rect',{...attrs,fill:'url(#effect-missing)'},layer);
      if(bin.coverage)svg('rect',{...attrs,fill:factor.color,opacity:effectOpacity(bin.rates[factor.key])*.32*bin.coverage},layer);
    }
  }
  let labelX=left+8,labelY=top+16;
  for(const factor of selectedFactors){
    const width=(factor.short.length+2)*7+16;
    if(labelX+width>right){labelX=left+8;labelY+=17;}
    svg('text',{x:labelX,y:labelY,fill:factor.color,class:'overlay-label'}).textContent=(factor.direction>0?'+ ':'− ')+factor.short;
    labelX+=width;
  }
  for(let value=0;value<=5;value++){svg('line',{x1:left,x2:right,y1:y(value),y2:y(value),class:'chart-grid'});const label=svg('text',{x:left-13,y:y(value)+4,'text-anchor':'end',class:'chart-label'});label.textContent=value;}
  const ticks=right<500?2:6;
  for(let i=0;i<=ticks;i++){const time=start+(end-start)*i/ticks;svg('line',{x1:x(time),x2:x(time),y1:top,y2:bottom,class:'chart-grid',opacity:'.35'});const label=svg('text',{x:x(time),y:322,'text-anchor':i===0?'start':i===ticks?'end':'middle',class:'chart-label'});label.textContent=hours>24?stamp(time):clock(time);}
  const plot=svg('g',{'clip-path':'url(#plot-clip)'});
  for(const [points,klass] of [[data.recorded,'recorded-path'],[candidate,'candidate-path']]){
    let d='',last=null;
    for(const point of plotPoints(points,start,end,right-left)){const move=point.breakBefore||!last;d+=(move?'M':'L')+x(point.time).toFixed(2)+','+y(point.value).toFixed(2);last=point;}
    svg('path',{d,class:klass},plot);
  }
  for(const observation of data.observations.filter(o=>o.observedAt>=start&&o.observedAt<=end)){
    const circle=svg('circle',{cx:x(observation.observedAt),cy:y(observation.intensity),r:5.5,class:'observation-dot'},plot);
    const title=svg('title',{},circle);title.textContent=`${stamp(observation.observedAt)} · observed ${observation.intensity} · ${observation.note}`;
  }
  for(const marker of data.markers??[]){if(marker.time<start||marker.time>end)continue;const line=svg('line',{x1:x(marker.time),x2:x(marker.time),y1:top,y2:bottom,stroke:'var(--amber)','stroke-dasharray':'3 5',opacity:'.7'},plot);svg('title',{},line).textContent=stamp(marker.time)+' · '+marker.label;}
  const at=data.samples[selected]?.time;
  if(at>=start&&at<=end){svg('line',{x1:x(at),x2:x(at),y1:top,y2:bottom,class:'cursor-line'});for(const [points,color]of [[data.recorded,'var(--recorded)'],[candidate,'var(--green)']]){const point=points[selected];if(Number.isFinite(point?.value))svg('circle',{cx:x(at),cy:y(point.value),r:4,fill:color});}}
  const cursor=$('effect-cursor');cursor.hidden=!(at>=start&&at<=end);cursor.style.left=x(at)+'px';
}
function effectStrips(){
  const {start,end}=visibleWindow(),width=Math.max(1,$('chart').clientWidth-plotLeft-plotRight);
  bins=effectBins(candidate,start,end,Math.ceil(width/3));
  for(const factor of grassFactors){
    const canvas=$('effect-'+factor.key),ratio=window.devicePixelRatio||1;
    canvas.width=Math.ceil(width*ratio);canvas.height=22*ratio;
    const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,width,22);
    for(let i=0;i<bins.length;i++){
      const bin=bins[i],x=Math.floor(i/bins.length*canvas.width)/ratio,w=Math.floor((i+1)/bins.length*canvas.width)/ratio-x;
      if(bin.coverage<.99){ctx.save();ctx.beginPath();ctx.rect(x,0,w,22);ctx.clip();ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--muted');ctx.globalAlpha=.35;ctx.lineWidth=1;for(let n=Math.floor(x/6)*6-24;n<x+w;n+=6){ctx.beginPath();ctx.moveTo(n,22);ctx.lineTo(n+22,0);ctx.stroke();}ctx.restore();}
      ctx.fillStyle=factor.color;ctx.globalAlpha=effectOpacity(bin.rates[factor.key])*bin.coverage;ctx.fillRect(x,0,w,22);ctx.globalAlpha=1;
    }
  }
}
function effectSelection(key){
  if(!data?.samples.length)return;
  if(key===null)activeEffects.clear();
  else if(activeEffects.has(key))activeEffects.delete(key);
  else activeEffects.add(key);
  for(const factor of grassFactors)$('select-'+factor.key).setAttribute('aria-pressed',String(activeEffects.has(factor.key)));
  $('clear-effect').disabled=activeEffects.size===0;inspect();chart();
}
function effectControls(){
  const host=$('effect-strips');
  for(const factor of grassFactors){
    const button=element('button',undefined,'effect-row');button.id='select-'+factor.key;button.type='button';button.style.setProperty('--factor',factor.color);
    button.setAttribute('aria-label',factor.label+' chart overlay');button.setAttribute('aria-pressed','false');
    const label=element('span',(factor.direction>0?'+ ':'− ')+factor.short,'effect-name'),canvas=element('canvas');canvas.id='effect-'+factor.key;canvas.setAttribute('aria-hidden','true');
    button.append(label,canvas);button.onclick=()=>effectSelection(factor.key);host.append(button);
  }
  $('clear-effect').onclick=()=>effectSelection(null);
}
function inspect(){
  if(!data?.samples.length)return;
  const sample=data.samples[selected],rows=sample.snapshot.rows;
  const value=key=>{const row=rows[key];return row?.source&&Number.isFinite(row.value)?readingValues(row.value,key,row.source,row.unit,{}).canonicalValue:null;};
  $('cursor-time').textContent=stamp(sample.time);
  $('inspect-recorded').textContent=fmt(data.recorded[selected]?.value);
  $('inspect-candidate').textContent=fmt(candidate[selected]?.value);
  $('inspect-dew').textContent=`${fmt(value('temperature'))}° / ${fmt(value('dew'))}°`;
  $('inspect-wind').textContent=fmt(value('wind'))+' mph';
  $('inspect-solar').textContent=(Number.isFinite(value('irradiance'))?Math.round(value('irradiance')):'—')+' W/m²';
  const effect=candidate[selected]?.effects,details=$('effect-inspection');details.replaceChildren();
  if(!effect){details.textContent='No calculation at this sample · '+(candidate[selected]?.moisture===undefined?candidate[selected]?.reason:'initialization, reset or repeated acquisition');return;}
  const factors=activeEffects.size?grassFactors.filter(f=>activeEffects.has(f.key)):grassFactors;
  for(const factor of factors){const rate=effect.rates[factor.key],item=element('span',`${factor.short} ${rate===0?'':factor.direction>0?'+':'−'}${rate.toFixed(2)}`);item.style.setProperty('--factor',factor.color);details.append(item);}
  details.append(element('small',`moisture / hour · ${clock(effect.start)}–${clock(effect.end)}${candidate[selected]?.value===null?' · model warming up':''}`));
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
  effectStrips();chart();inspect();table();metrics();
  $('candidate-label').textContent='Your alternative';
  $('experiment-mode').textContent='One alternative profile across the retained history. Reset loads the current saved settings.';
  const v=data.validation;
  $('replay-note').textContent=v?.mismatches?`Replay could not reproduce ${v.mismatches} saved estimates. Treat alternatives as unverified; export this dataset for investigation.`:v?.verified?`Verified baseline: ${v.compared.toLocaleString()} recorded estimates match. Replay starts from the retained boundary state. Original estimates and observations stay fixed.`:'Verifying the original calculation in your browser…';
}
function recalculate(){
  if(!data?.samples.length)return;
  if(busy){queued=true;return;}busy=true;
  $('replay-duration').textContent='…';
  worker.postMessage({id:++requestId,parameters,...(!loaded?{data:{samples:data.samples,recorded:data.recorded,initialState:data.initialState}}:{})});loaded=true;
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
    const factor=grassFactors.find(f=>f.key===key);if(factor){field.style.setProperty('--factor',factor.color);field.classList.add('factor-control');}
    const input=element('input');Object.assign(input,{id:'tune-'+key,type:'range',min:String(min),max:String(max),step:'0.05',value:String(parameters[key])});input.setAttribute('aria-describedby','hint-'+key);
    const detail=element('small',hint);detail.id='hint-'+key;field.append(title,input,detail);host.append(field);
    input.addEventListener('input',()=>{parameters[key]=Number(input.value);output.textContent=parameters[key].toFixed(2)+'×';clearTimeout(frame);frame=setTimeout(recalculate,100);});
  }

  $('reset').onclick=resetParameters;
  document.querySelectorAll('[data-hours]').forEach(button=>button.onclick=()=>{hours=Number(button.dataset.hours);document.querySelectorAll('[data-hours]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));effectStrips();chart();});
  resizeObserver?.disconnect();resizeObserver=new ResizeObserver(()=>{effectStrips();chart();});resizeObserver.observe($('chart').parentElement);
  $('cursor').max=data.samples.length-1;$('cursor').value=selected;$('cursor').oninput=()=>{selected=Number($('cursor').value);inspect();chart();};
  const pointAt=event=>{const rect=$('chart').getBoundingClientRect();if(event.clientX<rect.left+plotLeft)return;const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left-plotLeft)/(rect.width-plotLeft-plotRight))),{start,end}=visibleWindow(),at=start+ratio*(end-start);selected=Math.max(0,Math.min(data.samples.length-1,nearestSample(at)));$('cursor').value=selected;inspect();chart();};
  for(const host of [$('chart'),$('effect-strips')]){host.onpointermove=event=>{if(event.pointerType!=='touch')pointAt(event);};host.onpointerdown=pointAt;}
}
function nearestSample(at){let low=0,high=data.samples.length-1;while(low<high){const mid=Math.floor((low+high)/2);if(data.samples[mid].time<at)low=mid+1;else high=mid;}return low>0&&at-data.samples[low-1].time<data.samples[low].time-at?low-1:low;}
function datasetLabels(){
  if(data.synthetic){$('dataset-notice').textContent='Illustrative weather and observations · isolated from your Pi · changes here never tune the live model.';return;}
  hours=168;document.querySelectorAll('[data-hours]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.hours)===hours)));
  $('dataset-notice').textContent=`Recorded history through ${stamp(data.end)} · loaded ${stamp(data.capturedAt)} · up to 30 days retained. Experiments do not change live settings.`;
  $('observations-note').textContent=`${data.observations.filter(o=>o.source?.type==='spreadsheet').length} observations imported from your spreadsheet. Times are ${data.timeZone}, accurate to the minute. Comparison uses the last available estimate at or before that time, within 10 minutes. Observations are saved on this installation. Refresh history to include new entries.`;
  $('tuning-note').textContent='Move a slider to apply one alternative profile across all retained inputs. Reset fetches the current saved settings.';
  $('dataset-markers').textContent=(data.markers??[]).map(m=>`${stamp(m.time)} · ${m.label} (tracker note)`).join(' · ');
}
$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';if(data?.samples.length)effectStrips();};
$('export').onclick=()=>{
  if(!data)return;const blob=new Blob([JSON.stringify({...data,candidateParameters:parameters,candidate},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='grass-lab-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function currentParameters(){
  const response=await fetch('/api/grass-lab/parameters',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Current Grass settings unavailable.');
  const value=validateGrassSettings((await response.json()).parameters);
  if(!value)throw Error('Current Grass settings are invalid.');
  return value;
}
async function resetParameters(){
  $('reset').disabled=true;$('refresh').disabled=true;
  const inputs=[...$('sliders').querySelectorAll('input')];inputs.forEach(input=>input.disabled=true);
  try{
    const current=await currentParameters();parameters=current;clearTimeout(frame);error('');
    for(const [key]of grassControls){$('tune-'+key).value=parameters[key];$('value-'+key).textContent=parameters[key].toFixed(2)+'×';}
    recalculate();
  }catch(e){error(e.message+' Your experiment has been kept. Try Reset again.');}
  finally{$('reset').disabled=false;$('refresh').disabled=false;inputs.forEach(input=>input.disabled=false);}
}
async function loadHistory(){
  $('refresh').disabled=true;
  try{
    const response=await fetch('/api/grass-lab/data',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Lab history unavailable.');const history=await response.json(),current=await currentParameters();data=history;
    parameters=current;selected=data.samples.length-1;loaded=false;candidate=[];error('');
    if(!data.samples.length){$('dataset-notice').textContent='No retained weather inputs yet. You can already save observations at /grass-obs.';table();metrics();return;}
    datasetLabels();$('sliders').replaceChildren();controls();recalculate();
  }catch(e){error(e.message+' Refresh to try again.');}finally{$('refresh').disabled=false;}
}
$('refresh').onclick=()=>{if(!busy)void loadHistory();};
effectControls();
void loadHistory();
