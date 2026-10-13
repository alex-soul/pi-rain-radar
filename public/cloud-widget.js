import {setupFloatingWidget} from './floating-widget.js';
import {editor,attachCog,tabbedEditor,canEditLocal,setupExplanationHover} from './local-ui.js';
import {cloudFooter} from './cloud-layers-model.js';
import {cloudPresentation} from './cloud-layers-render.js';

export const cloudDefaults={opacity:80,font:100,cloudOpacity:85,cloudSize:100,texture:100,units:'m',scale:0};
export function createCloudWidget({parent,storagePrefix='radar-',onClose,selection}){
  const area=document.createElement('aside');area.id='cloud-layers';area.className='cloud-layers-widget';area.tabIndex=0;area.hidden=true;area.setAttribute('aria-label','Cloud layers');
  area.innerHTML='<div class="cloud-plot"></div><div class="cloud-footer"><span class="footer-observation"><span class="cloud-led" role="img"></span><span class="cloud-station"></span></span><button class="cloud-groups" aria-label="Cloud report details"></button></div><button id="cloud-layers-resize" type="button" aria-label="Resize Cloud layers">◢</button>';
  parent.append(area);
  const settings={...cloudDefaults},key=storagePrefix+'cloud-settings';
  const ranges=[['cloudOpacity','Cloud opacity',20,100],['cloudSize','Cloud size',50,200],['texture','Shape irregularity',0,100],['opacity','Widget opacity',0,100],['font','Font size',75,150]];
  try{const saved=JSON.parse(localStorage.getItem(key));for(const [id,,min,max]of ranges)if(Number.isFinite(saved?.[id]))settings[id]=Math.max(min,Math.min(max,saved[id]));if(['m','ft'].includes(saved?.units))settings.units=saved.units;if([0,1500,3000,6000].includes(saved?.scale))settings.scale=saved.scale;}catch{}
  const dialog=editor('cloud-layers-editor','Cloud layers'),cloudControls=[];
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(settings));}catch{}paint();};
  for(const [id,title,min,max]of ranges){
    const box=document.createElement('div');box.className='local-opacity';
    box.innerHTML=`<label for="cloud-setting-${id}">${title} <output>${settings[id]}%</output></label><input id="cloud-setting-${id}" type="range" min="${min}" max="${max}" step="5" value="${settings[id]}">`;
    box.querySelector('input').oninput=e=>{if(!canEditLocal())return;settings[id]=Number(e.target.value);box.querySelector('output').textContent=settings[id]+'%';save();};dialog.append(box);if(cloudControls.length<3)cloudControls.push(box);
  }
  const selects={};
  for(const [id,title,choices]of [['units','Y-axis units',[['m','Metres'],['ft','Feet']]],['scale','Vertical scale',[[0,'Automatic'],[1500,''],[3000,''],[6000,'']]]]){
    const label=document.createElement('label');label.className='misc-option';label.textContent=title;
    const select=document.createElement('select');select.id='cloud-setting-'+id;
    for(const [value,text]of choices)select.add(new Option(text,value));select.value=settings[id];
    select.onchange=()=>{if(!canEditLocal())return;settings[id]=id==='scale'?Number(select.value):select.value;save();};selects[id]=select;label.append(select);dialog.append(label);
  }
  const panelSelection=selection(dialog);
  tabbedEditor(dialog,'Clouds',cloudControls,[{title:'Panels',nodes:[panelSelection]}]);attachCog(area,dialog,'cloud-layers-edit','Edit Cloud layers');
  const floating=setupFloatingWidget({id:area.id,storageKey:storagePrefix+'cloud-window',width:200,height:100,minWidth:200,minHeight:100,maxWidth:Infinity,maxHeight:Infinity,startX:28,startY:420,rememberVisibility:false,onClose});
  const detail=document.createElement('div');detail.className='weather-explanation';detail.id='cloud-report-detail';detail.setAttribute('role','tooltip');detail.hidden=true;document.body.append(detail);
  let input={report:{raw:'',layers:[],state:'missing',message:''},station:'EGBB',dataState:'unavailable',seed:7},pinned=false,lastDetail='';
  const groups=area.querySelector('.cloud-groups');
  function hide(){pinned=false;detail.hidden=true;groups.removeAttribute('aria-describedby');}
  function show(){if(!canEditLocal())return;detail.hidden=false;groups.setAttribute('aria-describedby',detail.id);const r=groups.getBoundingClientRect();detail.style.left=Math.max(8,Math.min(innerWidth-detail.offsetWidth-8,r.left))+'px';detail.style.top=Math.max(8,Math.min(innerHeight-detail.offsetHeight-8,r.bottom+8))+'px';}
  setupExplanationHover(groups,show,()=>{if(!pinned)hide();});groups.onfocus=show;groups.onblur=()=>{if(!pinned)hide();};groups.onclick=()=>{if(pinned)hide();else{show();pinned=true;}};
  document.addEventListener('pointerdown',e=>{if(!groups.contains(e.target)&&!detail.contains(e.target))hide();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
  for(const name of ['resize','radar-screen-lock','weather-explanation-close'])window.addEventListener(name,hide);area.addEventListener('radar-widget-gesture',hide);
  function paint(){
    const footer=cloudFooter(input.report,input);area.style.setProperty('--cloud-alpha',settings.opacity/100);area.style.setProperty('--cloud-font',settings.font/100);
    area.querySelector('.cloud-led').dataset.health=footer.health;area.querySelector('.cloud-led').setAttribute('aria-label',footer.label);area.querySelector('.cloud-station').textContent=footer.station;groups.textContent=footer.groups;
    for(const option of selects.scale.options)if(Number(option.value))option.textContent='Fixed · '+Math.round(Number(option.value)*(settings.units==='m'?1:1/.3048)).toLocaleString('en-GB')+' '+settings.units;
    if(area.hidden)return;
    const height=Math.max(24,area.clientHeight-area.querySelector('.cloud-footer').offsetHeight-6);
    const view=cloudPresentation(input.report,{...settings,...input,width:area.offsetWidth,height,vvStyle:'haze',convectiveShading:true});
    const plot=area.querySelector('.cloud-plot');plot.innerHTML=view.svg;if(view.showVV)plot.querySelector('svg').setAttribute('aria-label',view.detail);
    if(view.message){const text=document.createElement('div');text.className='cloud-plot-state';text.textContent=view.message;plot.append(text);}
    // The footer is the compact target for mouse, keyboard and touch detail.
    const text=[footer.label,input.station,input.timestamp,view.detail].filter(Boolean).join(' · ');
    if(text!==lastDetail){lastDetail=text;detail.textContent=text;hide();}groups.setAttribute('aria-label','Cloud report details: '+text);
  }
  new ResizeObserver(paint).observe(area);
  return {area,dialog,update(value){input=value;paint();},setVisible(value){if(!value)hide();floating.setVisible(value);paint();}};
}
