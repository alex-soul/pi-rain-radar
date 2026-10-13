import {createAviationUI} from './aviation-ui.js';
import {aviationAt} from './aviation-model.js';
import {cloudObservation} from './cloud-observation.js';
const $=id=>document.getElementById(id),ui=createAviationUI();
export function updateAviation(input){ui.update(input);ui.updateClouds(cloudObservation(input.historical?aviationAt(input.history,input.time):input.status,input.time));}
export function setupAviationSettings(canEdit,request){
 let loaded=false,busy=false;
 const paint=data=>{$('aviation-enabled').checked=!!data.enabled;$('aviation-station').value=data.station??'EGBB';$('aviation-note').textContent=data.enabled?'Collecting METAR and TAF every five minutes from NOAA Aviation Weather Center.':'METAR and TAF collection disabled.';};
 async function load(){loaded=false;try{const response=await request('/aviation');if(!response.ok)throw Error();paint(await response.json());loaded=true;}catch{$('aviation-note').textContent='Aviation settings unavailable.';}}
 $('aviation-save').onclick=async()=>{if(!loaded||busy||!canEdit())return;busy=true;$('aviation-save').disabled=true;try{const response=await request('/aviation',{enabled:$('aviation-enabled').checked,station:$('aviation-station').value});const data=await response.json();if(!response.ok)throw Error(data.error??'Could not save Aviation settings.');paint(data);window.dispatchEvent(new Event('radar-sources-change'));}catch(e){$('aviation-note').textContent=e.message;}finally{busy=false;$('aviation-save').disabled=false;}};
 return {load,reset(){loaded=false;}};
}
