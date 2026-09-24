import {connectionSaved} from './integration-onboarding.js';
import {refineReview} from './settings-layout-details.js';
import {shared,change} from './integrations-state.js';
import {loadWeatherChoices} from './weather-settings-ui.js';
import {settingsRequest} from './integrations-state.js';
const $=id=>document.getElementById(id);
const make=(html)=>{const t=document.createElement('template');t.innerHTML=html;return t.content.firstElementChild;};
const button=(id,label,panel,selected=false)=>make(`<button id="${id}" type="button" role="tab" aria-selected="${selected}" aria-controls="${panel}" tabindex="${selected?0:-1}">${label}</button>`);
const parent=$('settings-fields');
// Reorganise existing controls before settings.js binds its tab navigation.
const map=$('settings-panel-map'),form=$('map-form');
const mapTabs=make('<div class="settings-tabs settings-subtabs" role="tablist" aria-label="Map categories"></div>');
const location=make('<section id="review-map-location" role="tabpanel" aria-labelledby="review-tab-location"></section>');
const regional=make('<section id="review-map-regional" role="tabpanel" aria-labelledby="review-tab-regional" hidden></section>');
location.append($('map-settings-intro'),form);map.append(mapTabs,location,regional);
const timezone=$('map-timeZone').parentElement;regional.append(timezone);
// Keep the input's original form association even though it has moved visually.
$('map-timeZone').setAttribute('form','map-form');
regional.append(make('<div class="weather-key-actions"><button type="button" id="review-region-save">Save time zone</button></div><p id="review-region-note" role="status"></p>'));
  $('review-region-save').onclick=async()=>{try{const timeZone=$('map-timeZone').value.trim();new Intl.DateTimeFormat('en',{timeZone});await change({action:'settings',timeZone});window.location.reload();}catch{$('review-region-note').textContent='Enter a valid time zone, for example Europe/London.';}};
const embed=$('settings-panel-embed');map.append(embed);embed.setAttribute('role','tabpanel');embed.setAttribute('aria-labelledby','review-tab-embed');
for(const [id,label,panel] of [['location','Location','review-map-location'],['regional','Regional','review-map-regional'],['embed','Embed','settings-panel-embed']])mapTabs.append(button('review-tab-'+id,label,panel,id==='location'));
const selector=$('settings-section');selector.querySelector('[value="embed"]').remove();selector.add(new Option('Power','power'),selector.querySelector('[value="about"]'));
const power=make('<section id="settings-panel-power" class="settings-content settings-tab-panel" role="region" aria-label="Power" hidden></section>');power.append($('device-power-title'),document.querySelector('.power-buttons'));parent.insertBefore(power,$('settings-panel-about'));
// Move storage detail to its drawer; keep status identifiers for existing painters.
const storage=make('<details class="estimate-drawer"><summary>Storage status</summary><div id="review-storage-details"></div></details>');storage.querySelector('div').append($('storage-summary'));$('settings-panel-storage').append(storage);
const oldStorage=$('status-storage');oldStorage.previousElementSibling.remove();oldStorage.hidden=true;
const groups=document.querySelector('.status-groups');
groups.append(make('<div class="settings-group"><h3 class="settings-group-title">Storage</h3><div class="source-status-row"><span>Archive storage</span><span id="review-storage-health" data-health="ready">Healthy</span></div><p id="review-storage-short"></p></div>'));
const camStatus=$('status-camera');camStatus.previousElementSibling.remove();camStatus.hidden=true;
groups.append(make('<div class="settings-group"><h3 class="settings-group-title">Integrations</h3><div class="source-status-row"><span>Home Assistant</span><span id="review-ha-health" data-health="neutral">Not configured</span></div><div class="source-status-row"><span>Camera</span><span id="review-camera-health" data-health="neutral">Not configured</span></div></div>'));
// Replace API camera panel with the independent HA connection.
$('api-tab-camera').textContent='HA';$('api-tab-camera').setAttribute('aria-controls','api-ha');
const oldCamera=$('api-camera');oldCamera.id='api-ha';
oldCamera.innerHTML=`<div class="api-provider-config"><div class="api-key-heading"><label for="review-ha-url">Home Assistant address</label><button class="review-help" type="button" aria-label="Home Assistant connection help" aria-expanded="false">ⓘ</button><a class="api-setup-link" href="https://www.home-assistant.io/docs/authentication/" target="_blank" rel="noopener">(Setup &amp; usage)</a></div><p id="review-ha-help" hidden>Use the address reachable from your Pi. The connection is shared by camera and weather. </p><input id="review-ha-url" type="url" placeholder="http://homeassistant.local:8123" spellcheck="false"><label for="review-ha-token">Access token</label><input id="review-ha-token" type="password" placeholder="Long-lived access token" autocomplete="off"><p id="review-ha-note" role="status">Not configured.</p><div class="weather-key-actions"><button type="button" id="review-ha-save">Save</button><button type="button" id="review-ha-remove">Remove</button></div><label class="misc-option" for="review-ha-collect">Enable HA weather collection<input id="review-ha-collect" type="checkbox" class="control-switch" role="switch"></label></div>`;
document.querySelector('.review-help').onclick=()=>{$('review-ha-help').hidden=!$('review-ha-help').hidden;document.querySelector('.review-help').setAttribute('aria-expanded',String(!$('review-ha-help').hidden));};
$('review-ha-save').onclick=async()=>{try{await change({action:'ha',url:$('review-ha-url').value,token:$('review-ha-token').value});$('review-ha-token').value='';$('review-ha-note').textContent='Connected';await loadIntegrationChoices();await connectionSaved('ha');}catch(e){$('review-ha-note').textContent=e.message;}};
$('review-ha-remove').onclick=async()=>{try{await change({action:'remove-ha'});}catch(e){$('review-ha-note').textContent=e.message;}};

const owm=make('<div class="review-collection"><label class="misc-option" for="review-owm-collect">Enable OpenWeather collection<input id="review-owm-collect" type="checkbox" class="control-switch" role="switch"></label><p class="review-muted">Disabling collection also stops rain forecast updates.</p></div>');$('openweather-config').append(owm);

// One camera, no profile library/active-camera selector.
document.querySelector('[aria-label="Interface categories"]').append(button('review-tab-camera','Camera','review-camera-panel'));
const cp=make(`<section id="review-camera-panel" class="settings-content settings-tab-panel" role="tabpanel" aria-labelledby="review-tab-camera" hidden><div id="camera-config"><label class="misc-option" for="review-camera-enabled">Enable camera collection<input id="review-camera-enabled" type="checkbox" class="control-switch" role="switch"></label><div class="weather-key-actions"><button type="button" id="review-camera-enable-save">Save collection setting</button></div><p id="review-camera-note" role="status"></p><div id="review-camera-row" class="review-camera-row" hidden><div><strong id="review-camera-name"></strong><p id="review-camera-kind"></p></div><div class="weather-key-actions"><button type="button" id="review-camera-edit">Edit</button><button type="button" id="review-camera-delete">Delete</button></div></div><button type="button" id="review-camera-add">Add camera</button></div></section>`);$('settings-panel-dashboard').append(cp);
// Archive always replays recorded source choices.
document.querySelector('.camera-caption').prepend($('camera-time'));
function health(id,label,level){$(id).textContent=label;$(id).dataset.health=level;}
let configSignature='';
function sync(){
 const configKey=JSON.stringify([shared.revision,shared.ha,shared.haUrl,shared.camera?.source,shared.cameraEnabled]);
 if(configKey!==configSignature){configSignature=configKey;
 $('review-ha-url').value=shared.haUrl;$('review-ha-save').textContent=shared.ha?'Replace':'Save';$('review-ha-remove').disabled=!shared.ha;

 }
 const ha=!shared.ha?'Not configured':shared.haHealth?.error??(shared.haHealth?.state==='connected'?'Connected':'Connecting…');
 health('review-ha-health',ha,ha==='Connected'?'ready':!shared.ha?'neutral':'error');$('review-ha-note').textContent=ha;
 const camera=!shared.camera?'Not configured':!shared.cameraEnabled?'Collection disabled':shared.camera.error??(shared.camera.fresh?'Collecting':'Waiting for snapshot');
 health('review-camera-health',camera,camera==='Collecting'?'ready':shared.camera?.error?'error':'neutral');
 $('review-camera-enabled').checked=shared.cameraEnabled;$('review-camera-enabled').disabled=!shared.camera;$('review-camera-note').textContent=camera;
 $('review-camera-add').hidden=!!shared.camera;$('review-camera-row').hidden=!shared.camera;
 if(shared.camera){$('review-camera-name').textContent=shared.camera.name;$('review-camera-kind').textContent=shared.camera.mode==='ha'?'Home Assistant':'Direct snapshot';}
}
refineReview();

window.addEventListener('integration-change',sync);sync();
// Existing status text is maintained by the real renderer; summarise it without duplicating detail.
new MutationObserver(()=>{const s=oldStorage.textContent;health('review-storage-health',s.includes('needs attention')?'Needs attention':s.includes('Storage is low')?'Rolling · low storage':'Healthy',s.includes('needs attention')?'error':s.includes('Storage is low')?'warning':'ready');$('review-storage-short').textContent=s.split('\n')[0];}).observe(oldStorage,{childList:true,subtree:true,characterData:true});
// Respect the existing settings lock; review controls must not remain in a modal after locking.
$('settings-dialog').addEventListener('close',()=>{for(const id of ['review-camera-dialog','review-preview-dialog'])$(id)?.close();$('review-ha-token').value='';});

export async function loadIntegrationChoices(){return loadWeatherChoices();}
