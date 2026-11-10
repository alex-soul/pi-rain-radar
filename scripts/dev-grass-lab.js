import {saveGrassParameters,save} from '/__grass-access.js';
import {panWindow,setupNavigation,minimumWindow} from '/__grass-navigation.js';
import {setupSettingsHelp} from './settings-help.js';
import {recordedSettingChanges,sampleAt,windowCursor,effectAt,calendarTicks} from './grass-lab-inspection.js';
import {grassFactors,effectBins,effectOpacity} from './grass-effects.js';
import {plotPoints} from './grass-plot.js';
import {grassControls,validateGrassSettings,grassLabels} from '/grass-wetness-settings.js';
import {readingValues} from '/reading-units.js';
import {alignedGrass} from '/grass-replay.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let resizeObserver=null;
let worker=new Worker('/grass-lab-worker.js',{type:'module'}),busy=false,queued=false,requestId=0,loaded=false;
let data,parameters,candidate=[],hours=72,selected=0,frame=0;
const activeEffects=new Set();
let bins=[],steps=[],ticks=[];
let cursorAt=0,settingsMarkers=[],viewport=null,viewFrame=0;
let tooltipPoints=[],tooltipPoint=null,hoverPoint=null;
const settingDefinitions=[...grassFactors,{key:'sensitivity',label:'Overall sensitivity',color:'#d596c9'},{key:'enabled',label:'Calculation',color:'#8d9fad'}];
const plotLeft=28,plotRight=12;
const fmt=value=>Number.isFinite(value)?value.toFixed(1):'—';
const stamp=time=>new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:data?.timeZone}).format(time);
const clock=time=>new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',timeZone:data?.timeZone}).format(time);
const error=message=>{$('error').textContent=message;$('error').hidden=!message;};
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function svg(tag,attributes,parent=$('chart')){const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attributes))node.setAttribute(k,v);parent.append(node);return node;}
function bounds(){return {start:Math.max(data.start,data.end-30*86400000,data.samples[0]?.time??data.start),end:data.end};}
function visibleWindow(){return viewport??bounds();}
function setWindow(next){
  hideChartTip();
  viewport=next;hours=(next.end-next.start)/3600000;
  cursorAt=windowCursor(cursorAt,next.start,next.end);
  cancelAnimationFrame(viewFrame);viewFrame=requestAnimationFrame(()=>{inspect();effectStrips();chart();timeline();});
}
function timeline(){
  const {start,end}=visibleWindow(),full=bounds(),span=full.end-full.start;
  const from=(start-full.start)/span*100,to=(end-full.start)/span*100;
  $('timeline-selection').style.left=from+'%';$('timeline-selection').style.width=(to-from)+'%';
  for(const [edge,value,position]of [['start',start,from],['end',end,to]]){
    const handle=$('timeline-'+edge);handle.style.left=position+'%';
    handle.setAttribute('aria-valuemin',edge==='start'?full.start:start+Math.min(minimumWindow,span));
    handle.setAttribute('aria-valuemax',edge==='end'?full.end:end-Math.min(minimumWindow,span));
    handle.setAttribute('aria-valuenow',value);handle.setAttribute('aria-valuetext',stamp(value));
  }
  const duration=hours>=48?(hours/24).toFixed(1).replace(/\.0$/,'')+' days':hours.toFixed(1).replace(/\.0$/,'')+'h';
  $('window-label').textContent=stamp(start)+' – '+stamp(end);
  $('window-label').title=duration;
  $('timeline-selection').setAttribute('aria-label','Move visible time window: '+stamp(start)+' to '+stamp(end));
  $('latest').disabled=end>=full.end-1;
  document.querySelectorAll('[data-hours]').forEach(button=>button.setAttribute('aria-pressed',String(Math.abs(hours-Number(button.dataset.hours))<1/3600000)));
}
function previewTimeline(){
  const root=$('timeline-preview'),{start,end}=bounds();root.replaceChildren();root.setAttribute('viewBox','0 0 1000 32');
  let path='',last=null;
  for(const p of plotPoints(data.recorded,start,end,1000)){
    path+=(p.breakBefore||!last?'M':'L')+((p.time-start)/(end-start)*1000).toFixed(2)+','+(29-p.value*5).toFixed(2);last=p;
  }
  svg('path',{d:path,fill:'none',stroke:'var(--recorded)','stroke-width':1.2},root);
}
function chart(){
  if(!data?.samples.length)return;
  hideChartTip();highlightChartPoint(null);tooltipPoints=[];
  const {start,end}=visibleWindow(),left=plotLeft,right=Math.max(240,$('chart').clientWidth)-plotRight,top=16,bottom=296,x=t=>left+(t-start)/(end-start)*(right-left),y=v=>bottom-v/5*(bottom-top);
  const root=$('chart');root.setAttribute('viewBox',`0 0 ${right+plotRight} 340`);root.replaceChildren();
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
  let lastLabelRight=-Infinity;
  for(const tick of ticks){
    svg('line',{x1:x(tick.time),x2:x(tick.time),y1:top,y2:bottom,class:'chart-grid',opacity:tick.midnight?'1':'.4','stroke-width':tick.midnight?1.3:1,'data-grid-time':tick.time});
    if(!tick.major)continue;
    const text=hours>=48&&tick.midnight?new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',timeZone:data.timeZone}).format(tick.time):clock(tick.time);
    const half=text.length*3.4,labelX=Math.max(left+half,Math.min(right-half,x(tick.time)));
    if(labelX-half<lastLabelRight+12)continue;
    svg('text',{x:labelX,y:322,'text-anchor':'middle',class:'chart-label','data-tick-time':tick.time}).textContent=text;
    lastLabelRight=labelX+half;
  }
  const plot=svg('g',{'clip-path':'url(#plot-clip)'});
  for(const [points,klass] of [[data.recorded,'recorded-path'],[candidate,'candidate-path']]){
    let d='',last=null;
    for(const point of plotPoints(points,start,end,right-left)){const move=point.breakBefore||!last;d+=(move?'M':'L')+x(point.time).toFixed(2)+','+y(point.value).toFixed(2);last=point;}
    svg('path',{d,class:klass},plot);
  }
  for(const marker of settingsMarkers){
    if(marker.time<start||marker.time>end)continue;
    const group=svg('g',{'data-settings-marker':marker.time},plot);
    for(const [i,change]of marker.changes.entries()){
      svg('line',{x1:x(marker.time),x2:x(marker.time),y1:top,y2:bottom,stroke:change.color,'stroke-dasharray':`3 ${Math.max(5,marker.changes.length*6-3)}`,'stroke-dashoffset':-i*6,opacity:'.8','data-setting':change.key},group);
    }
    const node=svg('g',{class:'settings-change-target',tabindex:0,role:'button','aria-label':`Settings change · ${stamp(marker.time)}`},group);
    const halfHeight=(marker.changes.length-1)*4,point={marker,node,x:x(marker.time),y:top+4+halfHeight,halfHeight};tooltipPoints.push(point);
    svg('rect',{x:point.x-10,y:top-6,width:20,height:halfHeight*2+20,rx:7,class:'settings-change-hit'},node);
    for(const [i,change]of marker.changes.entries())svg('circle',{cx:point.x,cy:top+4+i*8,r:3,fill:change.color},node);
    node.onfocus=()=>{cursorAt=marker.time;inspect();paintCursor();};
    node.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();showChartTip(point);}};
  }
  for(const observation of data.observations.filter(o=>o.observedAt>=start&&o.observedAt<=end)){
    const node=svg('g',{class:'observation-target',tabindex:0,role:'button','data-observation':observation.id,'aria-label':`Observation · ${stamp(observation.observedAt)}`},plot);
    const point={observation,node,x:x(observation.observedAt),y:y(observation.intensity)};tooltipPoints.push(point);
    svg('circle',{cx:point.x,cy:point.y,r:12,class:'observation-hit'},node);
    svg('circle',{cx:point.x,cy:point.y,r:5.5,class:'observation-dot'},node);
    node.onfocus=()=>{cursorAt=observation.observedAt;inspect();paintCursor();};
    node.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();showChartTip(point);}};
  }
  const cursorLayer=svg('g',{id:'chart-cursor','pointer-events':'none','aria-hidden':'true'});
  svg('line',{id:'cursor-guide',y1:top,y2:bottom,class:'cursor-line'},cursorLayer);
  svg('circle',{id:'cursor-recorded',r:4,fill:'var(--recorded)'},cursorLayer);
  svg('circle',{id:'cursor-alternative',r:4,fill:'var(--green)'},cursorLayer);
  paintCursor();
}
// Hover changes only these existing cursor nodes; curves and observation targets stay stable.
function paintCursor(){
  const layer=$('chart-cursor');if(!layer)return;
  const {start,end}=visibleWindow(),right=Math.max(240,$('chart').clientWidth)-plotRight,at=cursorAt;
  const x=time=>plotLeft+(time-start)/(end-start)*(right-plotLeft),y=value=>296-value/5*280;
  layer.style.display=at>=start&&at<=end?'':'none';
  $('cursor-guide').setAttribute('x1',x(at));$('cursor-guide').setAttribute('x2',x(at));
  for(const [id,points]of [['cursor-recorded',data.recorded],['cursor-alternative',candidate]]){
    const point=points[selected],node=$(id);node.style.display=Number.isFinite(point?.value)?'':'none';
    if(Number.isFinite(point?.value)){node.setAttribute('cx',x(at));node.setAttribute('cy',y(point.value));}
  }
  const cursor=$('effect-cursor');cursor.hidden=!(at>=start&&at<=end);cursor.style.left=x(at)+'px';
}
function highlightChartPoint(point){
  if(hoverPoint===point)return;
  hoverPoint?.node.classList.remove('tip-hover');hoverPoint=point;
  hoverPoint?.node.classList.add('tip-hover');
}
function hideChartTip(){
  $('chart-tooltip').hidden=true;
  if(tooltipPoint){tooltipPoint.node.removeAttribute('aria-describedby');tooltipPoint.node.classList.remove('tip-open');tooltipPoint=null;}
}
function showChartTip(point){
  if(!point){hideChartTip();return;}
  if(tooltipPoint!==point){
    hideChartTip();tooltipPoint=point;
    const {observation,marker,node}=point,content=$('tooltip-content'),time=marker?.time??observation.observedAt;
    content.replaceChildren();content.classList.toggle('empty',!marker&&!observation.note?.trim());
    if(marker){
      const value=v=>typeof v==='boolean'?(v?'On':'Off'):Number(v).toFixed(2)+'×';
      for(const change of marker.changes){
        const row=element('div',undefined,'tooltip-change'),label=element('span',change.label,'tooltip-change-label'),values=element('span',undefined,'tooltip-change-values');
        row.style.setProperty('--factor',change.color);
        values.append(element('span',value(change.from),'previous-value'),element('span',' → ','change-arrow'),element('strong',value(change.to)));
        row.append(label,values);content.append(row);
      }
    }else content.textContent=observation.note?.trim()||'No comment';
    $('tooltip-time').textContent=stamp(time);$('tooltip-time').dateTime=new Date(time).toISOString();
    $('tooltip-intensity').textContent=marker?'First recorded':'Intensity '+observation.intensity;
    node.setAttribute('aria-describedby','chart-tooltip');node.classList.add('tip-open');
  }
  const tip=$('chart-tooltip'),root=$('chart'),rect=root.getBoundingClientRect(),scale=rect.width/root.viewBox.baseVal.width;
  tip.hidden=false;tip.style.maxHeight=Math.max(120,rect.height-16)+'px';
  const x=point.x*scale,y=point.y*scale,width=tip.offsetWidth,height=tip.offsetHeight;
  tip.style.left=Math.max(8,Math.min(rect.width-width-8,x-width/2))+'px';
  tip.style.top=Math.max(8,Math.min(rect.height-height-8,y-height-16>=8?y-height-16:y+16))+'px';
}
function tooltipNear(event){
  const root=$('chart'),rect=root.getBoundingClientRect(),scale=rect.width/root.viewBox.baseVal.width;
  const x=event.clientX-rect.left,y=event.clientY-rect.top;
  let nearest=null,distance=event.pointerType==='touch'?22:12;
  for(const point of tooltipPoints){const dy=Math.max(0,Math.abs(y-point.y*scale)-(point.halfHeight??0)*scale),d=Math.hypot(x-point.x*scale,dy);if(d<=distance){nearest=point;distance=d;}}
  return nearest;
}
function effectStrips(){
  if(!data?.samples.length)return;
  const {start,end}=visibleWindow(),width=Math.max(1,$('chart').clientWidth-plotLeft-plotRight);
  bins=effectBins(candidate,start,end,Math.ceil(width/3));
  ticks=calendarTicks(start,end,width,data.timeZone);
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
  $('reset-overlays').disabled=activeEffects.size===0;
  inspect();chart();
}
function effectControls(){
  const host=$('effect-strips');
  $('reset-overlays').onclick=()=>effectSelection(null);
  for(const factor of grassFactors){
    const button=element('button',undefined,'effect-row');button.id='select-'+factor.key;button.type='button';button.style.setProperty('--factor',factor.color);
    button.setAttribute('aria-label',factor.label+' chart overlay');button.setAttribute('aria-pressed','false');
    const label=element('span',(factor.direction>0?'+ ':'− ')+factor.short,'effect-name'),canvas=element('canvas');canvas.id='effect-'+factor.key;canvas.setAttribute('aria-hidden','true');
    button.append(label,canvas);button.onclick=()=>effectSelection(factor.key);host.append(button);
  }
}
function inspect(){
  if(!data?.samples.length)return;
  selected=sampleAt(data.samples,cursorAt);
  const sample=data.samples[selected],rows=sample?.snapshot.rows??{};
  const value=key=>{const row=rows[key];return row?.source&&Number.isFinite(row.value)?readingValues(row.value,key,row.source,row.unit,{}).canonicalValue:null;};
  $('cursor-time').textContent=stamp(cursorAt);
  $('cursor-time').dateTime=new Date(cursorAt).toISOString();
  $('inspect-recorded').textContent=fmt(data.recorded[selected]?.value);
  $('inspect-candidate').textContent=fmt(candidate[selected]?.value);
  $('inspect-temperature').textContent=fmt(value('temperature'))+'°';
  $('inspect-dew').textContent=fmt(value('dew'))+'°';
  $('inspect-wind').textContent=fmt(value('wind'))+' mph';
  $('inspect-solar').textContent=(Number.isFinite(value('irradiance'))?Math.round(value('irradiance')):'—')+' W/m²';
  const effect=effectAt(steps,cursorAt),details=$('effect-inspection');details.replaceChildren();
  if(!effect){details.textContent='No calculated contribution for this interval.';return;}
  const factors=activeEffects.size?grassFactors.filter(f=>activeEffects.has(f.key)):grassFactors;
  for(const factor of factors){const rate=effect.rates[factor.key],item=element('span',`${factor.short} ${rate===0?'':factor.direction>0?'+':'−'}${rate.toFixed(2)}`);item.style.setProperty('--factor',factor.color);details.append(item);}
}
function table(){
  const body=$('observations');body.replaceChildren();
  for(const o of [...data.observations].reverse().slice(0,200)){
    const row=element('tr');row.append(element('td',stamp(o.observedAt)));
    const intensity=element('td');intensity.append(element('span',o.intensity,'intensity-chip'));row.append(intensity);
    row.append(element('td',fmt(alignedGrass(data.recorded,o.observedAt)?.value)),element('td',fmt(alignedGrass(candidate,o.observedAt)?.value),'accent'),element('td',o.note||'—','observation-note'));
    const action=element('td'),edit=element('button','Edit','text-button observation-edit');edit.setAttribute('aria-label','Edit observation '+stamp(o.observedAt));edit.onclick=()=>openObservation(o,edit);action.append(edit);row.append(action);body.append(row);
  }
  $('observation-count').textContent=data.observations.length+' entries'+(data.observations.length>200?' · latest 200 shown':'');
}
function paintReplay(){
  steps=candidate.flatMap(point=>point.effects?[point.effects]:[]);
  inspect();effectStrips();chart();table();timeline();
  if(data.validation?.mismatches)error(`Replay could not reproduce ${data.validation.mismatches} saved estimates. Treat alternatives as unverified; export this dataset for investigation.`);
}

function recalculate(){
  if(!data?.samples.length)return;
  if(busy){queued=true;return;}busy=true;
  worker.postMessage({id:++requestId,parameters,...(!loaded?{data:{samples:data.samples,recorded:data.recorded,initialState:data.initialState}}:{})});loaded=true;
}
worker.onmessage=event=>{
  const result=event.data;busy=false;
  if(result.error){error(result.error);return;}
  if(result.validation)data.validation={...result.validation,verified:result.validation.mismatches===0};
  if(queued){queued=false;recalculate();return;}
  candidate=result.points;paintReplay();
};
worker.onerror=()=>{busy=false;error('Replay could not start. Refresh this page to try again.');};
function controls(){
  const host=$('sliders');
  for(const [key,label,hint,min,max]of grassControls){
    if(['rain','solar','sensitivity'].includes(key))host.append(element('div',key==='rain'?'WETTING':key==='solar'?'DRYING':'DISPLAY','slider-group'));
    const field=element('div',undefined,'slider-field'),title=element('label',label),output=element('output',parameters[key].toFixed(2)+'×');title.htmlFor='grass-'+key;output.id='value-'+key;title.append(output);
    const factor=settingDefinitions.find(f=>f.key===key);if(factor){field.style.setProperty('--factor',factor.color);field.classList.add('factor-control');}
    const input=element('input');Object.assign(input,{id:'grass-'+key,type:'range',min:String(min),max:String(max),step:'0.05',value:String(parameters[key])});
    field.append(title,input);host.append(field);
    input.addEventListener('input',()=>{$('apply-message').textContent='';parameters[key]=Number(input.value);output.textContent=parameters[key].toFixed(2)+'×';clearTimeout(frame);frame=setTimeout(recalculate,100);});
  }

  setupSettingsHelp(host,{viewport:true});
  document.addEventListener('scroll',()=>{const active=host.querySelector('.settings-info[aria-expanded="true"]');active?.click();},true);
  $('reset').onclick=resetParameters;
  $('apply').onclick=applyParameters;
  resizeObserver=new ResizeObserver(()=>{effectStrips();chart();timeline();});resizeObserver.observe($('chart').parentElement);
  const pointAt=event=>{
    const rect=$('chart').getBoundingClientRect();if(event.clientX<rect.left+plotLeft){highlightChartPoint(null);return;}
    const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left-plotLeft)/(rect.width-plotLeft-plotRight))),{start,end}=visibleWindow();
    cursorAt=start+ratio*(end-start);inspect();paintCursor();
    const point=tooltipNear(event);highlightChartPoint(point);
    if(event.type==='pointerup')showChartTip(point);
  };
  setupNavigation({chart:$('chart'),timeline:$('timeline'),selection:$('timeline-selection'),leftHandle:$('timeline-start'),rightHandle:$('timeline-end'),getBounds:bounds,getWindow:visibleWindow,setWindow,inspect:pointAt,plotLeft,plotRight});
  $('effect-strips').addEventListener('pointermove',event=>{if(event.pointerType!=='touch'){pointAt(event);highlightChartPoint(null);}});
  $('chart').addEventListener('pointerleave',()=>highlightChartPoint(null));
  document.addEventListener('pointerdown',event=>{if(!$('chart-tooltip').contains(event.target))hideChartTip();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hideChartTip();});
  $('chart').onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const {start,end}=visibleWindow();
    if(event.shiftKey){const delta=event.key==='Home'?bounds().start-start:event.key==='End'?bounds().end-end:(event.key==='ArrowLeft'?-1:1)*(end-start)/10;setWindow(panWindow(visibleWindow(),delta,bounds()));return;}
    cursorAt=event.key==='Home'?start:event.key==='End'?end:windowCursor(cursorAt+(event.key==='ArrowLeft'?-1:1)*(end-start)/200,start,end);inspect();paintCursor();
  };
  $('latest').onclick=()=>setWindow(panWindow(visibleWindow(),bounds().end-visibleWindow().end,bounds()));
  document.querySelectorAll('[data-hours]').forEach(button=>button.onclick=()=>{const {start,end}=bounds();setWindow({start:Math.max(start,end-Number(button.dataset.hours)*3600000),end});});

}
$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';if(data?.samples.length)effectStrips();};
$('export').onclick=()=>{
  if(!data)return;const blob=new Blob([JSON.stringify({...data,candidateParameters:parameters,candidate},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='grass-lab-experiment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function currentParameters(){
  const response=await fetch('/__grass-lab/parameters',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Current Grass settings unavailable.');
  const value=validateGrassSettings((await response.json()).parameters);
  if(!value)throw Error('Current Grass settings are invalid.');
  return value;
}
async function resetParameters(){
  $('reset').disabled=true;$('refresh').disabled=true;$('apply').disabled=true;
  const inputs=[...$('sliders').querySelectorAll('input')];inputs.forEach(input=>input.disabled=true);
  try{
    const current=await currentParameters();parameters=current;clearTimeout(frame);error('');$('apply-message').textContent='';
    for(const [key]of grassControls){$('grass-'+key).value=parameters[key];$('value-'+key).textContent=parameters[key].toFixed(2)+'×';}
    recalculate();
  }catch(e){error(e.message+' Your experiment has been kept. Try Reset again.');}
  finally{$('reset').disabled=false;$('refresh').disabled=false;$('apply').disabled=false;inputs.forEach(input=>input.disabled=false);}
}
async function applyParameters(){
  const values=Object.fromEntries(grassControls.map(([key])=>[key,parameters[key]]));
  const inputs=[...$('sliders').querySelectorAll('input')];
  for(const id of ['apply','reset','refresh'])$(id).disabled=true;
  inputs.forEach(input=>input.disabled=true);$('apply-message').textContent='';error('');
  try{
    const result=await saveGrassParameters(values);
    parameters=validateGrassSettings(result.parameters);if(!parameters)throw Error('Saved settings could not be read. Use Reset to check them.');
    $('apply-message').textContent='Applied to this DEV preview.';recalculate();
  }catch(e){$('apply-message').textContent=e.message;}
  finally{for(const id of ['apply','reset','refresh'])$(id).disabled=false;inputs.forEach(input=>input.disabled=false);}
}
async function loadHistory(){
  $('refresh').disabled=true;$('apply').disabled=true;$('reset').disabled=true;
  try{
    const response=await fetch('/__grass-lab/data',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Lab history unavailable.');const history=await response.json(),current=await currentParameters();data=history;
    parameters=current;cursorAt=data.end;selected=data.samples.length-1;settingsMarkers=recordedSettingChanges(data.samples,settingDefinitions);loaded=false;candidate=[];steps=[];error('');
    if(!data.samples.length){error('No retained weather inputs yet. You can still add observations.');table();return;}
    viewport={start:Math.max(bounds().start,data.end-168*3600000),end:data.end};hours=(viewport.end-viewport.start)/3600000;previewTimeline();timeline();if(!$('sliders').children.length)controls();
    for(const [key]of grassControls){$('grass-'+key).value=parameters[key];$('value-'+key).textContent=parameters[key].toFixed(2)+'×';}
    recalculate();
  }catch(e){error(e.message+' Refresh to try again.');}finally{$('refresh').disabled=false;$('apply').disabled=!parameters||!$('sliders').children.length;$('reset').disabled=false;}
}
$('refresh').onclick=()=>{if(!busy)void loadHistory();};
effectControls();
void loadHistory();
const localTime=time=>{const d=new Date(time);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
let editing=null,editGrade=null,editBusy=false,editOpener=null;
for(let i=0;i<=5;i++){
  const button=element('button',String(i));button.type='button';button.setAttribute('aria-label',i+' · '+grassLabels[i]);
  button.onclick=()=>{editGrade=i;for(const b of $('edit-grades').children)b.setAttribute('aria-pressed',String(b===button));};$('edit-grades').append(button);
}
function openObservation(observation,opener){
  editing=observation;editGrade=observation.intensity;editOpener=opener;
  for(const [i,button]of [...$('edit-grades').children].entries())button.setAttribute('aria-pressed',String(i===editGrade));
  $('edit-time').value=localTime(observation.observedAt);$('edit-time').max=localTime(Date.now());$('edit-note').value=observation.note;
  $('edit-message').textContent='';$('delete-confirm').hidden=true;$('edit-actions').hidden=false;$('edit-observation').showModal();
}
function closeEditor(){if(editBusy)return;$('edit-observation').close();editOpener?.focus();}
for(const id of ['edit-close','cancel-edit'])$(id).onclick=closeEditor;
$('edit-observation').oncancel=event=>{if(editBusy)event.preventDefault();};
$('delete-observation').onclick=()=>{$('delete-confirm').hidden=false;$('edit-actions').hidden=true;$('keep-observation').focus();};
$('keep-observation').onclick=()=>{$('delete-confirm').hidden=true;$('edit-actions').hidden=false;$('delete-observation').focus();};
async function changeObservation(remove=false){
  if(editBusy)return;
  const time=$('edit-time').value===localTime(editing.observedAt)?editing.observedAt:new Date($('edit-time').value).getTime();
  if(!remove&&(!Number.isFinite(time)||time>Date.now())){$('edit-message').textContent='Choose a valid time in the past.';return;}
  editBusy=true;const controls=[...$('edit-form').querySelectorAll('button,input')];controls.forEach(b=>b.disabled=true);$('edit-message').textContent='';
  try{
    const result=await save('observations/'+encodeURIComponent(editing.id),remove?{}:{intensity:editGrade,observedAt:time,note:$('edit-note').value},remove?'DELETE':'PATCH');
    data.observations=data.observations.flatMap(o=>o.id===editing.id?(remove?[]:[result]):[o]).sort((a,b)=>a.observedAt-b.observedAt);
    $('edit-observation').close();table();chart();$('observation-count').tabIndex=-1;$('observation-count').focus();
  }catch(e){$('edit-message').textContent=e.message;}
  finally{editBusy=false;controls.forEach(b=>b.disabled=false);}
}
$('edit-form').onsubmit=event=>{event.preventDefault();void changeObservation();};
$('confirm-delete').onclick=()=>void changeObservation(true);
