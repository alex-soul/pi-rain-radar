import {setupFloatingWidget} from './floating-widget.js';
import {editor,attachCog,opacityControl,fontControl,canEditLocal,setupExplanationHover,tabbedEditor} from './local-ui.js';
import {localPreferences} from './local-preferences.js';
import {aviationAt,aviationProducts,aviationNames} from './aviation-model.js';
import {migrateAviationGroup,changeAviation,groupVisible,aviationPanels,panelNames} from './aviation-group-model.js';
import {createCloudWidget} from './cloud-widget.js';

// Shared widget UI, exercised by the synthetic review before the live adapter is connected.
export function createAviationUI({storagePrefix='radar-'}={}){
const $=id=>document.getElementById(id),parent=$('aviation-toggle').closest('main'),storageKey=storagePrefix+'aviation-group';
const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
let group=migrateAviationGroup(read(storageKey),read(storagePrefix+'aviation-layout'),read(storagePrefix+'aviation'));
try{localStorage.setItem(storageKey,JSON.stringify(group));}catch{}
function panel(id,label){const area=document.createElement('aside');area.id=id;area.className='aviation-widget';area.tabIndex=0;area.setAttribute('aria-label',label);area.hidden=true;const body=document.createElement('div');body.className='aviation-content';body.dataset.widgetScroll='';const resize=document.createElement('button');resize.id=id+'-resize';resize.type='button';resize.textContent='◢';resize.setAttribute('aria-label','Resize '+label);area.append(body,resize);parent.append(area);return area;}
const combined=panel('aviation','Aviation weather'),detached={metar:panel('aviation-metar','METAR'),taf:panel('aviation-taf','TAF')};
for(const area of [combined,...Object.values(detached)]){const handle=document.createElement('button');handle.type='button';handle.className='widget-drag-handle';handle.dataset.widgetDrag='';handle.setAttribute('aria-label','Move '+area.getAttribute('aria-label'));handle.title='Drag to move · Arrow keys to move';const grip=document.createElement('span');grip.setAttribute('aria-hidden','true');handle.append(grip);area.append(handle);}
const dialog=editor('aviation-editor','Aviation weather');
const selections=[];
function selection(host){
  const field=document.createElement('fieldset');field.className='aviation-selection';
  const legend=document.createElement('legend');legend.textContent='Open with Aviation';field.append(legend);
  for(const p of aviationPanels){const label=document.createElement('label');label.className='misc-option';label.textContent=panelNames[p];const input=document.createElement('input');input.type='checkbox';input.className='control-switch';input.setAttribute('role','switch');input.checked=group.selected[p];input.onchange=()=>dispatch({type:'select',panel:p,value:input.checked});label.append(input);field.append(label);selections.push([p,input]);}
  host.append(field);return field;
}
const panelSelection=selection(dialog);
const detachLabel=document.createElement('label');detachLabel.className='misc-option';detachLabel.textContent='Split METAR and TAF';
const detach=document.createElement('input');detach.type='checkbox';detach.className='control-switch';detach.setAttribute('role','switch');detach.checked=group.split;detach.onchange=()=>dispatch({type:'split',value:detach.checked});detachLabel.append(detach);dialog.append(detachLabel);
opacityControl(dialog,'aviation');fontControl(dialog,'aviation');
tabbedEditor(dialog,'Panels',[panelSelection]);
for(const area of [combined,...Object.values(detached)])attachCog(area,dialog,area.id+'-edit','Edit Aviation weather');
// The group owns the button and visibility persistence; floating widgets own geometry only.
const button=$('aviation-toggle');button.id='aviation-group-toggle';button.setAttribute('aria-controls','aviation aviation-metar aviation-taf cloud-layers');
const minHeight=()=>Math.ceil(15*(localPreferences.fonts.aviation??100)/100*1.65+26),windows={};
for(const p of aviationProducts)windows[p]=setupFloatingWidget({id:'aviation-'+p,storageKey:storagePrefix+'aviation-window-'+p,width:p==='taf'?500:420,height:p==='taf'?230:145,minWidth:180,minHeight,maxWidth:1000,maxHeight:Infinity,startX:p==='taf'?460:28,startY:200,rememberVisibility:false,onClose:()=>dispatch({type:'close',panel:p})});
const master=setupFloatingWidget({id:'aviation',storageKey:storagePrefix+'aviation',width:520,height:200,minWidth:180,minHeight,maxWidth:1000,maxHeight:Infinity,startX:28,startY:180,rememberVisibility:false,onClose:()=>dispatch({type:'close',panel:'text'})});
button.id='aviation-toggle';
const clouds=createCloudWidget({parent,storagePrefix,onClose:()=>dispatch({type:'close',panel:'clouds'}),selection});
button.onclick=()=>dispatch({type:'toggle'});
function dispatch(action){if(!canEditLocal())return;const result=changeAviation(group,action);group=result.state;try{localStorage.setItem(storageKey,JSON.stringify(group));}catch{}apply();render();if(result.picker)dialog.showModal();}
function apply(){
  master.setVisible(!group.split&&(group.open.metar||group.open.taf));
  for(const p of aviationProducts)windows[p].setVisible(group.split&&group.open[p]);
  clouds.setVisible(group.open.clouds);
  button.setAttribute('aria-pressed',String(groupVisible(group)));button.setAttribute('aria-label',groupVisible(group)?'Hide Aviation weather':'Show Aviation weather');
  for(const [p,input]of selections)input.checked=group.selected[p];detach.checked=group.split;
  const credit=$('aviation-credit');if(credit)credit.hidden=!groupVisible(group);
}
const popup=document.createElement('div');popup.id='aviation-explanation';popup.className='weather-explanation';popup.setAttribute('role','tooltip');popup.hidden=true;document.body.append(popup);
let selected=null,pinned=false,lastInput=null,signature='';
function closeExplanation(){selected?.classList.remove('aviation-explained');selected?.removeAttribute('aria-describedby');selected=null;pinned=false;popup.hidden=true;}
function position(){if(!selected)return;const r=selected.getBoundingClientRect(),box=popup.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(innerWidth-box.width-8,r.left))+'px';popup.style.top=Math.max(8,Math.min(innerHeight-box.height-8,r.bottom+10))+'px';}
function explain(target,meaning){if(!canEditLocal())return;if(selected!==target){window.dispatchEvent(new Event('weather-explanation-close'));selected=target;target.classList.add('aviation-explained');target.setAttribute('aria-describedby',popup.id);}popup.replaceChildren();const title=document.createElement('strong');title.textContent=target.textContent;const text=document.createElement('div');text.textContent=meaning;popup.append(title,text);popup.hidden=false;position();}
window.addEventListener('weather-explanation-close',closeExplanation);
document.addEventListener('pointerdown',e=>{if(selected&&!selected.contains(e.target)&&!popup.contains(e.target))closeExplanation();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeExplanation();});
window.addEventListener('resize',closeExplanation);window.addEventListener('radar-widget-gesture',closeExplanation);
new MutationObserver(()=>{if(!canEditLocal())closeExplanation();}).observe(document.body,{attributes:true,attributeFilter:['class']});
for(const area of [combined,...Object.values(detached)]){area.addEventListener('radar-widget-gesture',closeExplanation);area.querySelector('.aviation-content').addEventListener('scroll',closeExplanation);new ResizeObserver(closeExplanation).observe(area);}
function reportNode(p,state){
 const report=state.reports?.[p],section=document.createElement('section');section.setAttribute('aria-label',aviationNames[p]);
 const text=document.createElement('p');text.className='aviation-raw';
 if(report){let offset=0;for(const s of report.sections??[]){text.append(document.createTextNode(report.raw.slice(offset,s.start)));const button=document.createElement('button');button.type='button';button.className='aviation-code';button.textContent=report.raw.slice(s.start,s.end);button.setAttribute('aria-label',button.textContent+' · Explain');
 setupExplanationHover(button,()=>{if(selected!==button||popup.hidden){pinned=false;explain(button,s.meaning);}},()=>{if(!pinned)closeExplanation();});
 button.onfocus=()=>explain(button,s.meaning);button.onblur=e=>{if(!popup.contains(e.relatedTarget)&&selected===button)closeExplanation();};button.onclick=()=>{if(selected===button&&pinned)closeExplanation();else{explain(button,s.meaning);pinned=true;}};text.append(button);offset=s.end;}text.append(document.createTextNode(report.raw.slice(offset)));}
 section.append(text);return section;
}
function render(){if(!lastInput)return;const {status,history,historical,time}=lastInput,state=historical?aviationAt(history,time):status??{unknown:true},key=JSON.stringify([state.reports,group.split,group.open]);
 if(key!==signature){signature=key;closeExplanation();combined.querySelector('.aviation-content').replaceChildren(...aviationProducts.filter(p=>group.open[p]).map(p=>reportNode(p,state)));for(const p of aviationProducts)detached[p].querySelector('.aviation-content').replaceChildren(reportNode(p,state));}
 for(const area of [combined,...Object.values(detached)]){area.style.setProperty('--aviation-font-scale',(localPreferences.fonts.aviation??100)/100);area.style.setProperty('--local-aviation-alpha',(localPreferences.opacity.aviation??70)/100);}
}
window.addEventListener('radar-local-preferences',render);
function updateAviation(input){lastInput=input;render();}

apply();
return {update:updateAviation,updateClouds:input=>clouds.update(input)};
}
