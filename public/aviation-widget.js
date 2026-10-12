import {setupFloatingWidget} from './floating-widget.js';
import {editor,attachCog,opacityControl,fontControl,canEditLocal} from './local-ui.js';
import {localPreferences} from './local-preferences.js';
import {aviationAt,aviationHealth,aviationProducts,aviationNames} from './aviation-model.js';
const $=id=>document.getElementById(id);
let split=false,visibleProducts={metar:true,taf:true};
try{const saved=JSON.parse(localStorage.getItem('radar-aviation-layout'));split=saved?.split===true;for(const p of aviationProducts)if(typeof saved?.visible?.[p]==='boolean')visibleProducts[p]=saved.visible[p];}catch{}
function save(){try{localStorage.setItem('radar-aviation-layout',JSON.stringify({split,visible:visibleProducts}));}catch{}}
function panel(id,label){const area=document.createElement('aside');area.id=id;area.className='aviation-widget';area.tabIndex=0;area.setAttribute('aria-label',label);area.hidden=true;const body=document.createElement('div');body.className='aviation-content';body.dataset.widgetScroll='';const resize=document.createElement('button');resize.id=id+'-resize';resize.type='button';resize.textContent='◢';resize.setAttribute('aria-label','Resize '+label);area.append(body,resize);$('aviation-toggle').closest('main').append(area);return area;}
const combined=panel('aviation','Aviation weather'),detached={metar:panel('aviation-metar','METAR'),taf:panel('aviation-taf','TAF')};
const dialog=editor('aviation-editor','Aviation weather');
const detachLabel=document.createElement('label');detachLabel.className='misc-option';detachLabel.textContent='Split METAR and TAF';
const detach=document.createElement('input');detach.type='checkbox';detach.className='control-switch';detach.setAttribute('role','switch');detach.checked=split;detachLabel.append(detach);dialog.append(detachLabel);
const visibility={};for(const p of aviationProducts){const label=document.createElement('label');label.className='misc-option';label.textContent='Show '+aviationNames[p];const input=document.createElement('input');input.type='checkbox';input.className='control-switch';input.setAttribute('role','switch');input.checked=visibleProducts[p];input.onchange=()=>{if(!canEditLocal()){input.checked=visibleProducts[p];return;}visibleProducts[p]=input.checked;save();apply();render();};visibility[p]=input;label.append(input);dialog.append(label);}
opacityControl(dialog,'aviation');fontControl(dialog,'aviation');
for(const area of [combined,...Object.values(detached)])attachCog(area,dialog,area.id+'-edit','Edit Aviation weather');
let master;const windows={};
for(const p of aviationProducts)windows[p]=setupFloatingWidget({id:'aviation-'+p,storageKey:'radar-aviation-window-'+p,width:p==='taf'?500:420,height:p==='taf'?230:145,minWidth:180,minHeight:90,maxWidth:1000,maxHeight:Infinity,startX:p==='taf'?460:28,startY:200,rememberVisibility:false,onClose:()=>{visibleProducts[p]=false;visibility[p].checked=false;save();apply();}});
master=setupFloatingWidget({id:'aviation',storageKey:'radar-aviation',width:520,height:290,minWidth:180,minHeight:100,maxWidth:1000,maxHeight:Infinity,startY:180,onVisibility:apply});
function apply(){const visible=master?.isVisible()??false;combined.hidden=!visible||split;for(const p of aviationProducts)windows[p]?.setVisible(visible&&split&&visibleProducts[p]);const credit=$('aviation-credit');if(credit)credit.hidden=!visible||!aviationProducts.some(p=>visibleProducts[p]);}
detach.onchange=()=>{if(!canEditLocal()){detach.checked=split;return;}split=detach.checked;save();apply();render();};apply();
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
const stamp=t=>Number.isFinite(t)?new Date(t).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' UTC':'—';
function reportNode(p,state,time){
 const report=state.reports?.[p],section=document.createElement('section'),heading=document.createElement('div');heading.className='aviation-report-heading';heading.textContent=aviationNames[p]+' · '+(state.station??'—');section.append(heading);
 const text=document.createElement('p');text.className='aviation-raw';
 if(report){let offset=0;for(const s of report.sections??[]){text.append(document.createTextNode(report.raw.slice(offset,s.start)));const button=document.createElement('button');button.type='button';button.className='aviation-code';button.textContent=report.raw.slice(s.start,s.end);button.setAttribute('aria-label',button.textContent+' · Explain');button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&!pinned)explain(button,s.meaning);});button.addEventListener('pointerleave',()=>{if(!pinned&&document.activeElement!==button)closeExplanation();});button.onfocus=()=>explain(button,s.meaning);button.onblur=e=>{if(!popup.contains(e.relatedTarget)&&selected===button)closeExplanation();};button.onclick=()=>{if(selected===button&&pinned)closeExplanation();else{explain(button,s.meaning);pinned=true;}};text.append(button);offset=s.end;}text.append(document.createTextNode(report.raw.slice(offset)));}
 else text.textContent=state.unknown?'No report recorded at this time.':state.enabled?'Waiting for a report.':'Collection disabled.';
 section.append(text);const caption=document.createElement('div');caption.className='aviation-caption';const health=aviationHealth(state,p,time);caption.dataset.health=health;
 const timing=report?(p==='metar'?'Observed '+stamp(report.observedAt):'Issued '+stamp(report.issuedAt)+' · Valid '+stamp(report.validFrom)+' – '+stamp(report.validTo))+' · Acquired '+stamp(report.acquiredAt):'';
 caption.textContent=({ready:'',warning:'Retained · collection interrupted · ',error:'Missing or unusable · ',pending:'Waiting · ',disabled:'Collection disabled · ',unknown:'No recorded state · '}[health]??'')+timing;section.append(caption);return section;
}
function render(){if(!lastInput)return;const {status,history,historical,time}=lastInput,state=historical?aviationAt(history,time):status??{unknown:true},key=JSON.stringify([state,split,visibleProducts,aviationProducts.map(p=>aviationHealth(state,p,time))]);
 if(key!==signature){signature=key;closeExplanation();combined.querySelector('.aviation-content').replaceChildren(...aviationProducts.filter(p=>visibleProducts[p]).map(p=>reportNode(p,state,time)));for(const p of aviationProducts)detached[p].querySelector('.aviation-content').replaceChildren(reportNode(p,state,time));}
 for(const area of [combined,...Object.values(detached)])area.style.setProperty('--aviation-font-scale',(localPreferences.fonts.aviation??100)/100);
}
window.addEventListener('radar-local-preferences',render);
export function updateAviation(input){lastInput=input;render();}
export function setupAviationSettings(canEdit,request){
 let loaded=false,busy=false;
 const paint=data=>{$('aviation-enabled').checked=!!data.enabled;$('aviation-station').value=data.station??'EGBB';$('aviation-note').textContent=data.enabled?'Collecting METAR and TAF every five minutes.':'Collection disabled.';};
 async function load(){loaded=false;try{const response=await request('/aviation');if(!response.ok)throw Error();paint(await response.json());loaded=true;}catch{$('aviation-note').textContent='Aviation settings unavailable.';}}
 $('aviation-save').onclick=async()=>{if(!loaded||busy||!canEdit())return;busy=true;$('aviation-save').disabled=true;try{const response=await request('/aviation',{enabled:$('aviation-enabled').checked,station:$('aviation-station').value});const data=await response.json();if(!response.ok)throw Error(data.error??'Could not save Aviation settings.');paint(data);window.dispatchEvent(new Event('radar-sources-change'));}catch(e){$('aviation-note').textContent=e.message;}finally{busy=false;$('aviation-save').disabled=false;}};
 return {load,reset(){loaded=false;}};
}
