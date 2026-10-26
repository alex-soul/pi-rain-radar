import {setupFloatingWidget} from './floating-widget.js';
import {editor,attachCog,opacityControl,fontControl,canEditLocal} from './local-ui.js';
import {localPreferences,saveLocalPreferences} from './local-preferences.js';
import {weatherReadings} from './weather-readings.js';
import {setupSettingsHelp,helpText} from './settings-help.js';
import {grassLabels,grassHints} from './grass-wetness-settings.js';

const button=document.getElementById('grass-wetness-toggle');
const panel=document.createElement('aside');panel.id='grass-wetness';panel.tabIndex=0;panel.hidden=true;panel.setAttribute('aria-label','Grass wetness');
panel.innerHTML='<div class="grass-content"><div class="grass-summary"><div class="grass-score">—<small>/ 5</small></div><div><span class="grass-status-title"><strong class="grass-label">Unavailable</strong></span><p class="grass-hint"></p></div></div><div class="grass-rail" aria-hidden="true">'+Array.from({length:6},(_,i)=>'<span><i></i><b>'+i+'</b></span>').join('')+'</div></div><button id="grass-wetness-resize" type="button" aria-label="Resize Grass wetness. Drag or use arrow keys.">◢</button>';
const minimalRail=document.createElement('div');minimalRail.className='grass-minimal-rail';minimalRail.setAttribute('aria-hidden','true');minimalRail.innerHTML='<i></i>'.repeat(5);panel.querySelector('.grass-content').append(minimalRail);
button.closest('main').append(panel);
const dialog=editor('grass-wetness-editor','Grass wetness');
opacityControl(dialog,'grass-wetness');fontControl(dialog,'grass-wetness');
const minimalOption=document.createElement('label');minimalOption.className='misc-option';minimalOption.htmlFor='grass-minimal';minimalOption.innerHTML='Minimalistic widget<input id="grass-minimal" type="checkbox" class="control-switch" role="switch">';dialog.append(minimalOption);
const minimalInput=minimalOption.querySelector('input');
minimalInput.onchange=()=>{if(canEditLocal()){localPreferences.grassMinimal=minimalInput.checked;saveLocalPreferences();panel.dispatchEvent(new Event('snapshot-size'));}};
attachCog(panel,dialog,'grass-wetness-edit','Edit Grass wetness');
setupFloatingWidget({id:'grass-wetness',storageKey:'radar-grass-wetness',width:280,height:112,minWidth:220,minHeight:()=>localPreferences.grassMinimal?40:Math.ceil(104*(localPreferences.fonts['grass-wetness']??100)/100),maxWidth:700,maxHeight:500,startX:70,startY:210});
const blades=["M5 24C5 18 4 14 2 11c4 2 6 7 6 13Z", "M9 24C9 16 7 10 6 7c4 4 5 10 5 17Z", "M13 24C11 14 12 6 14 3c2 8 1 14 1 21Z", "M17 24C17 16 19 10 22 7c-2 6-3 11-3 17Z", "M22 24C22 17 24 13 27 11c-2 4-3 8-3 13Z"];
button.innerHTML='<svg viewBox="0 0 28 28" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+blades.map(d=>'<path class="grass-icon-blade" d="'+d+'"/>').join('')+'<path id="grass-icon-ground" d="M2 25h24"/><path id="grass-icon-unknown" d="M10 26h8" stroke-width="2.5"/></svg>';
let latest=null;
setupSettingsHelp(panel,{viewport:true,text:()=>[latest?.reason,latest?.status==='disabled'&&latest.setupMissing?.length?'Setup needed: '+latest.setupMissing.join('; '):'',helpText.grassReadiness].filter(Boolean).join('. ')});
function paint(){
 const row=latest,ready=Number.isInteger(row?.value),level=ready?row.value:null;
 const title=ready?`${level} of 5 · ${grassLabels[level]}`:row?.reason??'Waiting for weather readings';
 minimalInput.checked=localPreferences.grassMinimal;panel.classList.toggle('grass-minimal',localPreferences.grassMinimal);
 panel.setAttribute('aria-description',title);minimalRail.classList.toggle('unknown',!ready);
 minimalRail.querySelectorAll('i').forEach((bar,i)=>bar.classList.toggle('filled',ready&&i<level));
 button.title=title;button.setAttribute('aria-description',title);
 button.querySelectorAll('.grass-icon-blade').forEach((blade,i)=>{blade.setAttribute('fill',ready&&i<level?'currentColor':'none');blade.setAttribute('stroke-dasharray',ready?'none':'1.7 2');blade.style.opacity=ready?'1':'.4';});
 document.getElementById('grass-icon-ground').style.display=ready?'':'none';
 document.getElementById('grass-icon-unknown').style.display=ready?'none':'';
 panel.querySelector('.grass-score').firstChild.textContent=ready?String(level):'—';
 panel.querySelector('.grass-label').textContent=ready?grassLabels[level]:({disabled:'Calculation disabled',setup:'Setup required',warming:'Warming up'})[row?.status]??'Unavailable';
 panel.querySelector('.grass-hint').textContent=ready?grassHints[level]:'';
 panel.querySelector('.grass-hint').hidden=!ready;

 panel.querySelectorAll('.grass-rail span').forEach((segment,i)=>{segment.classList.toggle('filled',ready&&i<=level);segment.classList.toggle('current',ready&&i===level);});
 panel.style.setProperty('--grass-font-scale',(localPreferences.fonts['grass-wetness']??100)/100);
}
export function updateGrassWetness(state,time,historical=false){latest=weatherReadings(state,time,{historical}).grassWetness;paint();}
window.addEventListener('radar-local-preferences',paint);
paint();
