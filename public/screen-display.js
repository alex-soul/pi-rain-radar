import {shared,change} from './integrations-state.js';
import {displayDefaults,displayChoices,displayLabels,displayChoiceLabel,validDisplay,migrateDisplayOverrides,effectiveDisplay} from './display-options.js';
const key='radar-display-overrides',read=k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}};
const saved=read(key),legacy=read('radar-display'),astronomy=read('radar-astronomy-dock');
let overrides=validDisplay(saved?.values),migrated=saved?.version===1;
export const globalDisplay=()=>({...displayDefaults,...shared.units,...shared.displaySettings?.values});
function ensureMigration(){if(!migrated&&shared.initialized){overrides=migrateDisplayOverrides(legacy,astronomy,shared.units);migrated=true;try{localStorage.setItem(key,JSON.stringify({version:1,values:overrides}));}catch{}}}
export function screenDisplay(){ensureMigration();return effectiveDisplay(globalDisplay(),overrides);}
export function setupScreenDisplay(top,canEditLocal){
 const section=document.createElement('div');section.className='screen-display-units';
 const grid=document.createElement('div');grid.className='units-grid';
 const inputs={};let signature='';
 for(const name of Object.keys(displayChoices)){
  const box=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');
  select.id='screen-'+name;label.htmlFor=select.id;label.textContent=displayLabels[name];box.append(label,select);grid.append(box);inputs[name]=select;
  select.onchange=()=>{if(!canEditLocal()){paint(true);return;}ensureMigration();if(select.value==='inherit')delete overrides[name];else overrides[name]=select.value;try{localStorage.setItem(key,JSON.stringify({version:1,values:overrides}));}catch{feedback.textContent='Applied for now; browser storage is unavailable.';}window.dispatchEvent(new Event('radar-weather-preferences'));paint();};
 }
 const feedback=document.createElement('p');feedback.setAttribute('role','status');section.append(grid,feedback);top.append(section);
 function paint(force=false){ensureMigration();const global=globalDisplay(),next=JSON.stringify([global,overrides]);if(!force&&signature===next)return;signature=next;for(const [name,input]of Object.entries(inputs)){input.replaceChildren(new Option('Inherit global ('+displayChoiceLabel(name,global[name])+')','inherit'),...displayChoices[name].map(v=>new Option(displayChoiceLabel(name,v),v)));input.value=overrides[name]??'inherit';}}
 window.addEventListener('integration-change',()=>paint());paint();return section;
}
export function setupGlobalDisplay(){
 const grid=document.querySelector('#review-weather-units .additional-weather-units');
 for(const id of ['sun','moon']){const old=document.getElementById('astro-'+id+'-mode');old?.parentElement.remove();const box=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');select.id='global-'+id+'-mode';label.htmlFor=select.id;label.textContent=displayLabels[id+'Mode'];box.append(label,select);grid.append(box);}
 const ids={temperatureUnit:'temperature-unit',windUnit:'wind-unit',visibilityUnit:'visibility-unit',pressureUnit:'pressure-unit',rainUnit:'rain-unit',directionFormat:'direction-format',directionConvention:'direction-convention',sunMode:'global-sun-mode',moonMode:'global-moon-mode'};
 const note=document.getElementById('shared-unit-note');let signature='';
 function paint(force=false){const values=globalDisplay(),next=JSON.stringify(values);if(!force&&signature===next)return;signature=next;for(const [name,id]of Object.entries(ids)){const input=document.getElementById(id);input.replaceChildren(...displayChoices[name].map(v=>new Option(displayChoiceLabel(name,v),v)));input.value=values[name];}}
 for(const [name,id]of Object.entries(ids))document.getElementById(id).onchange=async e=>{const input=e.target;input.disabled=true;note.textContent='';try{await change({action:'display',values:{[name]:input.value}});}catch(error){note.textContent=error.message;}finally{input.disabled=false;paint(true);}};
 window.addEventListener('integration-change',()=>paint());paint();
}
