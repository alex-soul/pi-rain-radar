import {settingsRequest} from './integrations-state.js';
const $=id=>document.getElementById(id),button=$('cloud-toggle');
button.removeAttribute('title');
export const cloudNodes=['radar','overview-radar'].map((id,i)=>{
 const node=document.createElementNS('http://www.w3.org/2000/svg','image');node.id=i?'overview-cloud-layer':'cloud-layer';node.setAttribute('width',i?'390':'1280');node.setAttribute('height',i?'280':'720');node.style.pointerEvents='none';$(id).before(node);return node;
});
let visible=true,current=null,saving=false,prefs={rain:80,cloud:65};
try{const saved=JSON.parse(localStorage.getItem('radar-layer-opacity'));for(const key of ['rain','cloud'])if(Number.isFinite(saved?.[key]))prefs[key]=Math.max(0,Math.min(100,saved[key]));const v=localStorage.getItem('radar-cloud-visible');if(v!==null)visible=v==='true';}catch{}
const tab=document.createElement('button');tab.id='settings-tab-clouds';tab.type='button';tab.role='tab';tab.textContent='Clouds';tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','settings-panel-clouds');tab.tabIndex=-1;$('settings-tab-weather').after(tab);
const panel=document.createElement('section');panel.id='settings-panel-clouds';panel.className='settings-content settings-tab-panel';panel.role='tabpanel';panel.setAttribute('aria-labelledby',tab.id);panel.hidden=true;
panel.innerHTML='<label class="misc-option" for="cloud-enabled">Enable clouds<input id="cloud-enabled" type="checkbox" role="switch" class="control-switch"></label><div id="cloud-options" hidden><label for="cloud-map">Display on</label><select id="cloud-map"><option value="main">Main</option><option value="overview">Overview</option><option value="both">Both</option></select></div><p id="cloud-note" class="review-muted" role="status"></p>';
$('settings-panel-weather').after(panel);
for(const [key,label]of [['rain','Rain opacity'],['cloud','Cloud opacity']]){
 const group=document.createElement('div');group.className='layer-opacity-controls';group.id=key+'-opacity-group';
 group.innerHTML=`<label for="${key}-opacity">${label} <output id="${key}-opacity-value"></output></label><input id="${key}-opacity" type="range" min="0" max="100" step="1">`;
 if(key==='rain')document.querySelector('.speed-labels').after(group);else $('cloud-options').append(group);
 const input=$(key+'-opacity');input.value=prefs[key];
 function apply(){$(key+'-opacity-value').textContent=prefs[key]+'%';for(const node of key==='rain'?[$('radar'),$('overview-radar')]:cloudNodes)node.style.opacity=String(prefs[key]/100);}
 input.addEventListener('input',()=>{prefs[key]=Number(input.value);apply();try{localStorage.setItem('radar-layer-opacity',JSON.stringify(prefs));}catch{}});apply();
}
const statusRow=document.createElement('div');statusRow.className='source-status-row';statusRow.innerHTML='<span>Clouds</span><span id="cloud-status" data-health="unconfigured">Disabled</span>';$('settings-radar-sources').append(statusRow);
export function cloudHealth(state){if(!state?.enabled)return ['unconfigured','Disabled'];return state.state==='ready'?['ready','Healthy']:['waiting','delayed','budget'].includes(state.state)?['warning',state.state==='budget'?'Budget paused':state.state==='waiting'?'Waiting for frames':'Delayed']:['error',state.state==='stale'?'Stale':'Unavailable'];}
export function updateCloudSettings(state){
 current=state??{enabled:false,configured:false,map:'main'};const [health,label]=cloudHealth(current);$('cloud-status').dataset.health=health;$('cloud-status').textContent=label;
 $('cloud-status').title=[current.error,...Object.entries(current.latest??{}).map(([role,t])=>`${role}: ${t?new Date(t).toLocaleString():'No frame'}`)].filter(Boolean).join(' · ');
 if(!saving){$('cloud-enabled').checked=!!current.enabled;$('cloud-enabled').disabled=!current.configured;$('cloud-map').value=current.map??'main';}
 $('cloud-options').hidden=!current.enabled;
 const usage=current.usage;$('cloud-note').textContent=!current.configured?'Configure Rainbow in System → API to enable clouds.':usage?.testRequestLimit!=null?`DEV allowance: ${Math.max(0,usage.testRequestLimit-usage.total)} of ${usage.testRequestLimit} requests remaining. Synthetic rain · real clouds.`:current.error??'';
 paintButton();
}
function paintButton(){button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',`${visible?'Hide':'Show'} clouds`);}
button.addEventListener('click',()=>{visible=!visible;paintButton();try{localStorage.setItem('radar-cloud-visible',String(visible));}catch{}window.dispatchEvent(new Event('radar-layers-change'));});paintButton();
async function save(){let failure=null;saving=true;$('cloud-enabled').disabled=true;$('cloud-map').disabled=true;try{const value=await settingsRequest('/clouds',{enabled:$('cloud-enabled').checked,map:$('cloud-map').value});current={...current,...value};window.dispatchEvent(new Event('radar-sources-change'));}catch(e){failure=e.message;}finally{saving=false;$('cloud-map').disabled=false;updateCloudSettings(current);if(failure)$('cloud-note').textContent=failure;}}
$('cloud-enabled').addEventListener('change',save);$('cloud-map').addEventListener('change',save);
export function cloudUrls(frame,demo,archive=false){
 if(!visible||!demo&&!archive&&!current?.enabled)return [null,null];if(demo){const row=demo.frames?.find(r=>r.time===frame?.time);return [row?.url??null,row?.overviewUrl??null];}
 return [frame?.cloudUrl??null,frame?.overviewCloudUrl??null];
}
