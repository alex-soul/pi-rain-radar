import {settingsRequest} from './integrations-state.js';
import {layerPreferences} from './layer-preferences.js';
const $=id=>document.getElementById(id);
export const cloudNodes=['radar','overview-radar'].map((id,i)=>{
 const node=document.createElementNS('http://www.w3.org/2000/svg','image');node.id=i?'overview-cloud-layer':'cloud-layer';node.setAttribute('width',i?'390':'1280');node.setAttribute('height',i?'280':'720');node.style.pointerEvents='none';$(id).before(node);return node;
});
let current=null,saving=false,prefs=layerPreferences(),layerStatus=null,archiveState=null;
try{prefs=layerPreferences(JSON.parse(localStorage.getItem('radar-map-layers')),JSON.parse(localStorage.getItem('radar-layer-opacity'))??{},localStorage.getItem('radar-cloud-visible')!=='false');}catch{}
export const layerVisible=(role,layer)=>prefs[role][layer].visible&&prefs[role][layer].opacity>0;
const toggle=document.createElement('button');toggle.id='layers-toggle';toggle.type='button';toggle.className='settings-button';toggle.hidden=true;
toggle.setAttribute('aria-label','Map layers');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','layers-panel');
toggle.innerHTML='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/></svg>';
const layers=document.createElement('section');layers.id='layers-panel';layers.hidden=true;layers.setAttribute('aria-label','Map layers');
layers.innerHTML='<div class="layers-heading"><strong>Layers</strong><button type="button" id="layers-close" aria-label="Close layers">×</button></div>'+['main','overview'].map(role=>`<fieldset><legend>${role==='main'?'Main map':'Overview'}</legend>${['rain','cloud'].map(layer=>`<div class="layer-choice"><label for="layer-${role}-${layer}">${layer==='rain'?'Rain':'Clouds'}<input type="checkbox" class="control-switch" role="switch" id="layer-${role}-${layer}"></label><label class="layer-opacity" for="layer-${role}-${layer}-opacity"><span>Opacity</span><output id="layer-${role}-${layer}-value"></output></label><input id="layer-${role}-${layer}-opacity" type="range" min="0" max="100" step="5" aria-label="${role} ${layer} opacity"><small id="layer-${role}-${layer}-reason"></small></div>`).join('')}</fieldset>`).join('');
document.querySelector('footer').append(toggle,layers);
function openLayers(value){layers.hidden=!value;toggle.setAttribute('aria-expanded',String(value));window.dispatchEvent(new Event('radar-settings-wake'));}
toggle.onclick=()=>openLayers(layers.hidden);$('layers-close').onclick=()=>openLayers(false);
document.addEventListener('pointerdown',e=>{if(!layers.hidden&&!layers.contains(e.target)&&!toggle.contains(e.target))openLayers(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')openLayers(false);});
function applyLayers(){
 for(const [i,role] of ['main','overview'].entries())for(const layer of ['rain','cloud']){
  const p=prefs[role][layer],node=layer==='rain'?$(i?'overview-radar':'radar'):cloudNodes[i];node.style.opacity=String(p.visible?p.opacity/100:0);
  $('layer-'+role+'-'+layer).checked=p.visible;$('layer-'+role+'-'+layer+'-opacity').value=p.opacity;$('layer-'+role+'-'+layer+'-value').textContent=p.opacity+'%';
 }
}
for(const role of ['main','overview'])for(const layer of ['rain','cloud']){
 const key='layer-'+role+'-'+layer;
 function saveLocal(){try{localStorage.setItem('radar-map-layers',JSON.stringify(prefs));}catch{}applyLayers();window.dispatchEvent(new Event('radar-layers-change'));}
 $(key).onchange=()=>{prefs[role][layer].visible=$(key).checked;saveLocal();};
 $(key+'-opacity').oninput=()=>{prefs[role][layer].opacity=Number($(key+'-opacity').value);saveLocal();};
}
applyLayers();
export function updateLayerAvailability(status,archive=null){
 layerStatus=status;archiveState=archive;
 for(const role of ['main','overview'])for(const layer of ['rain','cloud']){
  const enabled=archive?(layer==='rain'?archive.coverage?.some(s=>s.sources?.[role]!=='disabled'):archive.cloudHistory?.roles?.includes(role)||archive.cloudHistory?.frames?.some(f=>f[role==='main'?'url':'overviewUrl'])):layer==='rain'?status?.sources?.[role]?.enabled!==false&&status?.sources?.[role]?.source!=='disabled':current?.enabled&&(current.map==='both'||current.map===role);
  const key='layer-'+role+'-'+layer;$(key).closest('.layer-choice').hidden=!enabled;$(key).disabled=!enabled;$(key+'-opacity').disabled=!enabled;$(key+'-reason').textContent=enabled?'':archive?'No layer in this archive':'Collection is off for this map';
 }
 for(const fieldset of layers.querySelectorAll('fieldset'))fieldset.hidden=![...fieldset.querySelectorAll('.layer-choice')].some(row=>!row.hidden);
}
const tab=document.createElement('button');tab.id='settings-tab-clouds';tab.type='button';tab.role='tab';tab.textContent='Clouds';tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','settings-panel-clouds');tab.tabIndex=-1;$('settings-tab-weather').after(tab);
const panel=document.createElement('section');panel.id='settings-panel-clouds';panel.className='settings-content settings-tab-panel';panel.role='tabpanel';panel.setAttribute('aria-labelledby',tab.id);panel.hidden=true;
panel.innerHTML='<label class="misc-option" for="cloud-enabled">Enable clouds<input id="cloud-enabled" type="checkbox" role="switch" class="control-switch"></label><div id="cloud-options" hidden><label for="cloud-map">Collect for</label><select id="cloud-map"><option value="main">Main</option><option value="overview">Overview</option><option value="both">Both</option></select></div><p id="cloud-note" class="review-muted" role="status"></p>';
$('settings-panel-weather').after(panel);
const statusRow=document.createElement('div');statusRow.className='source-status-row';statusRow.innerHTML='<span>Clouds</span><span id="cloud-status" data-health="unconfigured">Disabled</span>';$('settings-radar-sources').append(statusRow);
export function cloudHealth(state){if(!state?.enabled)return ['unconfigured','Disabled'];return state.state==='ready'?['ready','Healthy']:['waiting','delayed','budget'].includes(state.state)?['warning',state.state==='budget'?'Budget paused':state.state==='waiting'?'Waiting for frames':'Delayed']:['error',state.state==='stale'?'Stale':'Unavailable'];}
export function updateCloudSettings(state){
 current=state??{enabled:false,configured:false,map:'main'};const [health,label]=cloudHealth(current);$('cloud-status').dataset.health=health;$('cloud-status').textContent=label;
 $('cloud-status').title=[current.error,...Object.entries(current.latest??{}).map(([role,t])=>`${role}: ${t?new Date(t).toLocaleString():'No frame'}`)].filter(Boolean).join(' · ');
 if(!saving){$('cloud-enabled').checked=!!current.enabled;$('cloud-enabled').disabled=!current.configured;$('cloud-map').value=current.map??'main';}
 $('cloud-options').hidden=!current.enabled;
 const usage=current.usage;$('cloud-note').textContent=!current.configured?'Configure Rainbow in System → API to enable clouds.':usage?.testRequestLimit!=null?`DEV allowance: ${Math.max(0,usage.testRequestLimit-usage.total)} of ${usage.testRequestLimit} requests remaining. Synthetic rain · real clouds.`:current.error??'';
 if(layerStatus)updateLayerAvailability(layerStatus,archiveState);
}
async function save(){let failure=null;saving=true;$('cloud-enabled').disabled=true;$('cloud-map').disabled=true;try{const value=await settingsRequest('/clouds',{enabled:$('cloud-enabled').checked,map:$('cloud-map').value});current={...current,...value};window.dispatchEvent(new Event('radar-sources-change'));}catch(e){failure=e.message;}finally{saving=false;$('cloud-map').disabled=false;updateCloudSettings(current);if(failure)$('cloud-note').textContent=failure;}}
$('cloud-enabled').addEventListener('change',save);$('cloud-map').addEventListener('change',save);
export function cloudUrls(frame,demo,archive=false){
 if(!demo&&!archive&&!current?.enabled)return [null,null];
 const row=demo?demo.frames?.find(r=>r.time===frame?.time):frame;
 return (demo?[row?.url??null,row?.overviewUrl??null]:[row?.cloudUrl??null,row?.overviewCloudUrl??null]).map((url,i)=>layerVisible(i?'overview':'main','cloud')?url:null);
}
