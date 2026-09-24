import {setupWeatherLayout} from './weather-settings-ui.js';
import {weatherProviderHealth} from './weather-readings.js';
import {shared,change} from './integrations-state.js';
const $=id=>document.getElementById(id);
const make=html=>{const t=document.createElement('template');t.innerHTML=html;return t.content.firstElementChild;};
const doc='https://github.com/alex-soul/pi-rain-radar/blob/main/docs/manual.md';
export function refineReview(){
 $('map-settings-intro').hidden=true;
 document.querySelector('.map-fields').append(make('<p id="review-map-warning">Changing coordinates or zoom changes the available archive.</p>'));
 setupWeatherLayout();
 document.querySelector('.review-help').remove();$('review-ha-help').remove();
 $('review-camera-enable-save').parentElement.remove();
 $('review-camera-add').classList.add('review-fixed-button');
 const storage=$('settings-panel-storage'),heading=storage.querySelector('h3');
 const help=make(`<details class="estimate-drawer embed-help review-retention-help"><summary><h3>Archive retention</h3></summary><p>Choose how long to keep history, or let available storage set the limit.</p><a href="${doc}#look-back-with-archive" target="_blank" rel="noopener">Archive guide</a></details>`);heading.replaceWith(help);
 const warning=[...storage.children].find(e=>e.tagName==='P'&&e.textContent.startsWith('Reducing retention'));
 if(warning)$('review-storage-details').prepend(warning);
 $('review-storage-details').append(make(`<a href="${doc}#look-back-with-archive" target="_blank" rel="noopener">Read more about archive storage</a>`));
 const storageDrawer=$('review-storage-details').parentElement;help.querySelector('a').remove();help.append($('review-storage-details'));storageDrawer.remove();
}
export function setupReviewRadar(){
 for(const provider of ['rainviewer','rainbow']){
  const host=$(provider+'-config');
  host.append(make(`<div class="review-collection"><label class="misc-option" for="review-${provider}-collect">Enable<input id="review-${provider}-collect" type="checkbox" class="control-switch" role="switch"></label><p id="review-${provider}-note" role="status"></p></div>`));
  const control=$('review-'+provider+'-collect');
  control.onchange=async()=>{const previous=shared[provider+'Collect'];control.disabled=true;try{await change({action:'settings',[provider+'Collect']:control.checked});window.dispatchEvent(new Event('radar-provider-change'));}catch{control.checked=previous;$('review-'+provider+'-note').textContent='Could not save. Please try again.';}finally{control.disabled=false;}};
 }
 // Keep operational controls with their feature and reusable credentials in API.
 const radar=$('api-radar'),radarTab=$('api-tab-radar');
 document.querySelector('[aria-label="Interface categories"]').insertBefore(radarTab,$('settings-tab-weather'));
 $('settings-panel-dashboard').append(radar);
 radar.classList.add('settings-content','settings-tab-panel');
 $('rainviewer-config').before($('radar-apply').closest('.weather-key-actions'),$('radar-source-note'));
 const credentials=make('<section id="review-api-rainbow" role="tabpanel" aria-labelledby="review-api-rainbow-tab" hidden><div class="api-provider-config"></div></section>');
 const target=credentials.firstElementChild;
 const key=$('rainbow-key');target.append(key.previousElementSibling,key,$('rainbow-key-note'),$('rainbow-save').parentElement);
 $('api-map').replaceWith(credentials);$('api-tab-map').replaceWith(make('<button id="review-api-rainbow-tab" type="button" role="tab" aria-controls="review-api-rainbow" aria-selected="false" tabindex="-1">Rainbow</button>'));
 $('api-tab-weather').textContent='OpenWeather';
 document.querySelector('[aria-label="API categories"]').prepend($('api-tab-weather'));
 const rainbow=$('rainbow-config');rainbow.prepend(make('<h3 class="settings-group-title">Rainbow</h3>'));
 const providers=make('<div class="review-radar-providers"></div>');
 radar.append(providers);providers.append($('rainviewer-config'),rainbow);
 radar.querySelector('.radar-source-column').classList.add('settings-group','review-radar-selection');
 const settling=make('<div class="settings-group review-settling"></div>');
 settling.append($('radar-settling').closest('label'),$('radar-settling-note'));providers.append(settling);
 const enable=$('review-rainbow-collect').closest('.review-collection');rainbow.insertBefore(enable,$('rainbow-cap').closest('label'));
 const group=$('settings-radar-sources');
 for(const [id,label]of [['rainviewer','RainViewer rain'],['rainbow','Rainbow rain']])group.append(make(`<div class="source-status-row"><span>${label}</span><span id="review-${id}-status" data-health="ready"></span></div>`));
 for(const [id,label]of [['owm','OpenWeather collection'],['ha-collection','HA weather collection']])$('settings-api-status').closest('.settings-group').append(make(`<div class="source-status-row"><span>${label}</span><span id="review-${id}-status" data-health="neutral"></span></div>`));
 // Keep compact rows, with shared grid tracks aligning the four outlines.
 const providerHeading=$('provider-status-title');
 const providerGroup=make('<section class="settings-group review-provider-group" aria-labelledby="provider-status-title"></section>');
 providerHeading.before(providerGroup);
 providerGroup.append(providerHeading,document.querySelector('.provider-links'));
 const originalMapStatus=new Map();
 function paint(){
  for(const provider of ['rainviewer','rainbow']){
   const enabled=shared[provider+'Collect']!==false;
   $('review-'+provider+'-collect').checked=enabled;
   const main=$('radar-main-source').value,overview=$('radar-overview-source').value;
   const selected=main===provider||overview===provider;
   const configured=provider==='disabled'||provider==='rainviewer'||!$('rainbow-key-note').textContent.toLowerCase().includes('not configured');
   if(provider==='rainbow')$('rainbow-config').dataset.reviewConfigured=String(configured);
   $('review-'+provider+'-collect').checked=configured&&enabled;$('review-'+provider+'-collect').disabled=!configured;
   const label=!configured?'Not configured':!enabled?'Disabled':selected?'Enabled':'Enabled · Not in use';
   // Only save failures appear here; routine operational status belongs in Status.
   const node=$('review-'+provider+'-status');node.textContent=label;node.dataset.health=enabled&&configured&&selected?'ready':'neutral';
  }
  for(const [id,selection]of [['settings-main-status','radar-main-source'],['settings-overview-status','radar-overview-source']]){
   const node=$(id);let provider=$(selection).value;if(provider==='same')provider=$('radar-main-source').value;
   const previous=originalMapStatus.get(id);
   if(!previous||node.textContent!==previous.override)originalMapStatus.set(id,{text:node.textContent,health:node.dataset.health});
   const record=originalMapStatus.get(id),configured=provider==='rainviewer'||!$('rainbow-key-note').textContent.toLowerCase().includes('not configured');
   const label=provider==='disabled'?'Disabled':!configured?'Not configured':shared[provider+'Collect']===false?'Disabled':null;
   const text=label?(provider==='disabled'?'Radar':provider==='rainviewer'?'RainViewer':'Rainbow')+' · '+label:record.text;
   if(node.textContent!==text)node.textContent=text;
   node.dataset.health=label?'unconfigured':record.health;record.override=text;
  }
  for(const [id,configured,enabled]of [['owm',shared.owm,shared.owmCollect],['ha-collection',shared.ha,shared.haCollect]]){
   const node=$('review-'+id+'-status'),result=weatherProviderHealth(shared.weather,id==='ha-collection'?'ha':'owm',Date.now(),{configured});
   node.textContent=result.summary;node.dataset.health=result.health;
  }
 }
 window.addEventListener('integration-change',paint);
 for(const id of ['radar-main-source','radar-overview-source'])$(id).addEventListener('change',paint);
 new MutationObserver(paint).observe($('rainbow-key-note'),{childList:true,characterData:true,subtree:true});
 for(const id of ['settings-main-status','settings-overview-status'])new MutationObserver(paint).observe($(id),{childList:true,characterData:true,subtree:true});
 paint();
}
