import {refresh} from './integrations-state.js';
const $=id=>document.getElementById(id);
let popup;
export async function connectionSaved(provider){
 const state=await refresh();
 if(!$('settings-dialog').open)return;
 if(!popup){
  popup=document.createElement('dialog');popup.id='review-saved-dialog';popup.setAttribute('aria-labelledby','review-saved-title');
  popup.innerHTML='<h2 id="review-saved-title"></h2><p id="review-saved-message"></p><div id="review-saved-links"></div><button type="button" id="review-saved-close">Close</button>';
  document.body.append(popup);$('review-saved-close').onclick=()=>popup.close();
  $('settings-dialog').addEventListener('close',()=>popup.close());
 }
 $('review-saved-title').textContent=provider==='owm'?'OpenWeather':'Home Assistant';
 const enabled=provider==='owm'?state.owmCollect:state.haCollect||state.cameraEnabled&&state.camera?.mode==='ha';
 $('review-saved-message').textContent=provider==='owm'?(enabled?'API key saved.':'API key saved. Weather collection is not enabled yet.'):(enabled?'Connection saved.':'Connection saved. You can now set up a camera or collect weather readings.');
 $('review-saved-links').replaceChildren();
 function link(label,camera=false){
  const a=document.createElement('a');a.href=camera?'#camera':'#weather-collection';a.textContent=label;
  a.onclick=event=>{event.preventDefault();popup.close();const section=$('settings-section');section.value='dashboard';section.dispatchEvent(new Event('change',{bubbles:true}));
   if(camera){$('review-tab-camera').click();$('review-camera-add').hidden?$('review-camera-enabled').focus():$('review-camera-add').focus();}
   else{$('settings-tab-weather').click();$('review-readings-tab').click();$(provider==='owm'?'review-owm-collect':'review-ha-collect').focus();}
  };$('review-saved-links').append(a);
 }
 if(!enabled){if(provider==='owm')link('Enable weather collection');else{link('Configure camera',true);link('Set up alternative weather readings');}}
 if(!popup.open)popup.showModal();
}
