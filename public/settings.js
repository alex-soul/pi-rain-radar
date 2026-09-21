import './settings-layout.js';
import {setupReviewRadar} from './settings-layout-details.js';
import {bindIntegrationSettings,refresh as refreshIntegrations} from './integrations-state.js';
import {loadIntegrationChoices} from './settings-layout.js';
import {connectionSaved} from './integration-onboarding.js';
import {setupCameraSettings} from './camera-settings-ui.js';
import {setupStorageSettings} from './storage-ui.js';
import { setupScreenLock } from './screen-lock.js';
import { setupReleaseInfo } from './release-ui.js';
import { setupEmbedSettings } from './embed-settings-ui.js';
import { setupDiagnostics } from './diagnostics.js';
import { setupSettingsIdle } from './settings-idle.js';
import { setupPinIdle } from './pin-idle.js';
import { setupControlEditor, setupResponsiveControls } from "./control-layout.js";
import { setupDisplaySettings, setupReadingEditor } from "./display.js";
import { setupPinEntry } from "./pin-entry.js";
import { setupSettingsHelp } from './settings-help.js';
import { setupRadarSettings } from './radar-settings-ui.js';
import { setupDevicePower } from './device-power.js';
const $ = (id) => document.getElementById(id);
const dialog = $('settings-dialog');

setupReleaseInfo(dialog);
const pinIdle = setupPinIdle(dialog, $('pin-panel'));
const confirmPinEntry = setupPinEntry($('settings-confirm-pin'), () => $('settings-pin-save').focus());
const newPinEntry = setupPinEntry($('settings-new-pin'), () => confirmPinEntry.focus());
let weatherKeyConfigured = false;
function weatherKeyButtons() { $('weather-key-save').textContent = weatherKeyConfigured ? 'Replace key' : 'Save key'; $('weather-key-remove').disabled = !weatherKeyConfigured; }
let pin = '', token = null, generation = 0, busy = false, configured = false;
let retryTimer, unlockedUntil = 0;
const settingsIdle = setupSettingsIdle({
  active: () => dialog.open && !$('settings-fields').hidden,
  protectedSession: () => configured,
  renew: async () => {
    const epoch = generation, response = await request('/activity', {});
    if (!response.ok) throw new Error('Session renewal failed');
    const result = await response.json();
    if (epoch === generation) unlockedUntil = result.expiresAt;
    return result.expiresAt;
  },
  close: () => dialog.close(),
});
for (const name of ['pointerdown','pointermove','keydown','input','change','click','scroll']) {
  document.addEventListener(name, event => {
    if (!event.isTrusted || (name === 'pointermove' && !event.buttons)) return;
    if (event.target.closest?.('#settings-dialog, #map-preview-dialog, #power-dialog, #radar-confirm-dialog, #external-dialog, #review-camera-dialog, #review-preview-dialog, #review-saved-dialog')) settingsIdle.activity();
  }, true);
}
function canEdit() { return (!configured || (!!token && Date.now() < unlockedUntil)) && dialog.open && !$('settings-fields').hidden; }
bindIntegrationSettings(canEdit,request);
const radarUI=setupRadarSettings(canEdit,request);setupReviewRadar();setupSettingsHelp(dialog);
const embedUI=setupEmbedSettings(canEdit,request);
const storageUI=setupStorageSettings(canEdit,request);
const cameraUI=setupCameraSettings(canEdit,request);
const powerUI=setupDevicePower(canEdit,request);
const resetButtons = setupControlEditor(canEdit);
const resetReadings = setupReadingEditor(canEdit);
const resetControlEditor = () => { resetButtons(); resetReadings(); };
setupScreenLock(canEdit);
setupDisplaySettings(canEdit);
setupResponsiveControls();
const sectionSelector = $('settings-section');
function resetSectionTabs() {
  const panel = $('settings-panel-'+sectionSelector.value);
  for (const list of panel.querySelectorAll('[role="tablist"]')) list.querySelector('[role="tab"]')?.click();
}
try {
  const saved = localStorage.getItem('radar-settings-section');
  if ([...sectionSelector.options].some(option => option.value === saved)) sectionSelector.value = saved;
} catch { /* Session-only navigation. */ }
sectionSelector.addEventListener('change', () => {
  resetControlEditor();
  for (const option of sectionSelector.options) {
    $(`settings-panel-${option.value}`).hidden = option.value !== sectionSelector.value;
  }
  resetSectionTabs();
  try { localStorage.setItem('radar-settings-section',sectionSelector.value); } catch { /* Session-only navigation. */ }
  dialog.scrollTop = 0;
  dialog.dispatchEvent(new Event('settings-tab-change'));
});
// Each main section starts at its first subtab, without rebuilding fields or discarding drafts.
for (const tablist of dialog.querySelectorAll('[role="tablist"]')) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  function selectTab(selected) {
    resetControlEditor();
    if (selected.id === 'settings-tab-api') $('api-tab-weather').click();
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !active;
    }
    dialog.scrollTop = 0;
    dialog.dispatchEvent(new Event('settings-tab-change'));
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (target === null) return;
      event.preventDefault(); selectTab(tabs[target]); tabs[target].focus();
    });
  }
}
function dots() {
  $('pin-dots').textContent = Array.from({ length: 6 }, (_, i) => i < pin.length ? '●' : '○').join(' ');
  $('pin-dots').setAttribute('aria-label', `${pin.length} of 6 digits entered`);
}
function enable(enabled) {
  for (const button of $('pin-keypad').querySelectorAll('button')) button.disabled = !enabled;
}
async function request(path, data, bearer = token) {
  return fetch(`/api/settings${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: 'no-store', signal: AbortSignal.timeout(path.startsWith('/camera/')?30_000:path==='/map/preview'?60_000:path==='/radar'?180_000:path==='/rainbow'?50_000:10_000),
  });
}
function discard(bearer) { if (bearer) void request('/lock', {}, bearer).catch(() => {}); }
const syncDiagnostics = setupDiagnostics(dialog, request, canEdit);
let savingRadar = false;
$('radar-settling').addEventListener('change', async () => {
  if($('radar-main-source')&&!$('fixture-toggle'))return; // Saved with the source form.
  if (!canEdit() || savingRadar) return;
  const field = $('radar-settling'), value = field.checked, epoch = generation;
  savingRadar = true; field.disabled = true;
  $('radar-settling-note').textContent = 'Saving…';
  try {
    const response = await request('/radar', { waitForSettle: value });
    if (epoch !== generation) return;
    if (response.status === 401) { dialog.close(); return; }
    if (!response.ok) throw new Error();
    $('radar-settling-note').textContent = 'Saved. Applies to the next radar acquisition.';
  } catch {
    if (epoch === generation) {
      field.checked = !value;
      $('radar-settling-note').textContent = 'Could not confirm the save. Reopen Settings to check.';
    }
  } finally { savingRadar = false; field.disabled = false; }
});
function lock() {
  cameraUI.reset();
  embedUI.clear();
  powerUI.clear();
  radarUI.clear();
  pinIdle.clear();
  closePreview();
  resetPinForm();
  $('settings-api-key').value = '';
  $('weather-key-save').disabled = false;
  $('weather-key-remove').disabled = !weatherKeyConfigured;
  unlockedUntil = 0; resetControlEditor();
  generation++;
  settingsIdle.clear(); clearTimeout(retryTimer);
  discard(token); token = null; pin = ''; busy = false; configured = false;
  $('settings-fields').hidden = true; $('pin-panel').hidden = false;
  sectionSelector.hidden = true;
  enable(false); dots();
}
async function open() {
  lock(); dialog.showModal(); pinIdle.arm();
  const current = generation;
  $('pin-message').textContent = 'Checking settings…';
  try {
    const response = await request('/auth');
    if (!response.ok) throw new Error();
    const state = await response.json();
    if (current !== generation) return;
    configured = state.configured;
    if (!configured) { await showSettings(current); return; }
    $('pin-message').textContent = 'Enter your six-digit PIN';
    enable(true);
  } catch { if (current === generation) $('pin-message').textContent = 'Cannot reach settings. Close and try again.'; }
}
async function unlock() {
  busy = true; enable(false);
  const current = generation;
  const submitted = pin; pin = ''; dots();
  $('pin-message').textContent = 'Unlocking…';
  try {
    const response = await request('/unlock', { pin: submitted });
    const result = await response.json();
    if (current !== generation) { discard(result.token); return; }
    if (!response.ok) {
      const wait = Math.max(1, result.retryAfter || 2);
      $('pin-message').textContent = response.status === 409 ? 'PIN protection changed. Close and reopen settings.' : `Not unlocked. Try again in ${wait} seconds.`;
      if (response.status !== 409) retryTimer = setTimeout(() => {
        busy = false; enable(true); $('pin-message').textContent = 'Enter your six-digit PIN';
      }, wait * 1000);
      return;
    }
    token = result.token;
    unlockedUntil = result.expiresAt;
    await showSettings(current);
    if (current !== generation) return;
  } catch {
    if (current !== generation) return;
    discard(token); token = null; busy = false; enable(configured);
    $('pin-message').textContent = 'Could not unlock. Please try again.';
  }
}
async function showSettings(current) {
    const settings = await request('');
    if (current !== generation) return;
    if (!settings.ok) throw new Error();
    const keyState = await settings.json();
    if (current !== generation) return;
    weatherKeyConfigured = !!keyState.apiKeyConfigured; weatherKeyButtons();
    $('settings-api-note').textContent = weatherKeyConfigured ? 'Configured.' : 'Not configured.';
    $('radar-settling').checked = keyState.radar?.waitForSettle ?? true;
    $('radar-settling-note').textContent = '';
    void radarUI.load(keyState.radar);
    void embedUI.load();
    void storageUI.load();
    void cameraUI.load();void refreshIntegrations().then(loadIntegrationChoices);
    if (keyState.map) for (const [key,value] of Object.entries(keyState.map)) {
      const field=$(`map-${key}`);
      field.value=key==='overviewZoom'?Number(value.toFixed(2)):value;
      field.dataset.original=String(value); field.dataset.display=field.value;
    }
    $('map-apply').disabled=!!keyState.mapUpdate?.busy;
    $('map-note').textContent=keyState.mapUpdate?.busy?'Preparing map…':keyState.mapUpdate?.error||'';
    configured = keyState.pinConfigured;
    resetPinForm();
    pinIdle.clear();
    $('pin-panel').hidden = true; $('settings-fields').hidden = false;
    sectionSelector.hidden = false;
    sectionSelector.dispatchEvent(new Event('change'));
    syncDiagnostics();
    $('settings-close').focus();
    settingsIdle.start(unlockedUntil);
}
function digit(value) {
  if (!dialog.open || busy || !configured || !$('settings-fields').hidden) return;
  if (pin.length < 6) pin += value;
  dots(); if (pin.length === 6) void unlock();
}
$('pin-keypad').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.digit) digit(button.dataset.digit);
  else { pin = button.id === 'pin-clear' ? '' : pin.slice(0, -1); dots(); }
});
dialog.addEventListener('keydown', (event) => {
  if (!$('settings-fields').hidden) return;
  if (/^\d$/.test(event.key)) { event.preventDefault(); digit(event.key); }
  if (event.key === 'Backspace' && !busy) { event.preventDefault(); pin = pin.slice(0, -1); dots(); }
});
$('settings-toggle').addEventListener('click', open);
$('settings-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', lock);
document.addEventListener('visibilitychange', () => { if (document.hidden && dialog.open) dialog.close(); });

async function saveWeatherKey(remove = false) {
  if (!canEdit()) { dialog.close(); return; }
  const epoch = generation;
  const apiKey = remove ? '' : $('settings-api-key').value.trim();
  if (!remove && !/^[a-f0-9]{32}$/i.test(apiKey)) { $('settings-api-note').textContent = 'Enter a 32-character OpenWeather API key.'; return; }
  $('settings-api-key').value = '';
  $('weather-key-save').disabled = true; $('weather-key-remove').disabled = true;
  $('settings-api-note').textContent = 'Saving…';
  try {
    const response = await request('/openweather', {apiKey});
    if (epoch !== generation) return;
    if (response.status === 401) { dialog.close(); return; }
    const result = await response.json();
    if (epoch !== generation) return;
    if (response.ok) { weatherKeyConfigured = !!result.apiKeyConfigured; weatherKeyButtons(); if(!remove)void connectionSaved("owm"); }
    $('settings-api-note').textContent = response.ok ? (weatherKeyConfigured ? 'Configured.' : 'Not configured.') : result.error || 'Could not save the key. Try again.';
  } catch { if (epoch === generation) $('settings-api-note').textContent = 'Save could not be confirmed. Reopen settings to check.'; }
  finally { if (epoch === generation) { $('weather-key-save').disabled = false; $('weather-key-remove').disabled = !weatherKeyConfigured; } }
}
$('weather-key-save').addEventListener('click', () => void saveWeatherKey());
$('weather-key-remove').addEventListener('click', () => void saveWeatherKey(true));

const previewDialog = $('map-preview-dialog');
let previewUrls=[],previewValues=null,previewRunning=false;
function closePreview() {
  if(previewDialog.open) previewDialog.close();
  for(const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls=[];previewValues=null;
  $('map-preview-main').removeAttribute('src');
  $('map-preview-overview').removeAttribute('src');
}
previewDialog.addEventListener('close',closePreview);
$('map-preview-close').addEventListener('click',closePreview);
$('map-preview-back').addEventListener('click',closePreview);
function mapValues() {
  const value={name:$('map-name').value.trim(),timeZone:$('map-timeZone').value.trim()};
  for(const key of ['lat','lon','zoom','overviewZoom']) {
    const field=$(`map-${key}`);
    value[key]=Number(field.value===field.dataset.display?field.dataset.original:field.value);
  }
  return value;
}
$('map-preview').addEventListener('click', async()=>{
  if(previewRunning || !$('map-form').reportValidity()) return;
  if(!canEdit()) { dialog.close(); return; }
  const epoch=generation,values=mapValues();
  previewRunning=true;$('map-preview').disabled=true;
  $('map-note').textContent='Preparing preview…';
  try {
    const response=await request('/map/preview',{...values,theme:document.documentElement.dataset.theme});
    if(epoch!==generation) return;
    if(response.status===401) { dialog.close(); return; }
    const result=await response.json();
    if(!response.ok) { $('map-note').textContent=result.error||'Preview unavailable.'; return; }
    closePreview();
    for(const [key,id] of [['main','map-preview-main'],['overview','map-preview-overview']]) {
      const url=URL.createObjectURL(new Blob([result[key]],{type:'image/svg+xml'}));
      previewUrls.push(url);$(id).src=url;
    }
    previewValues=values;
    await Promise.all([$('map-preview-main').decode(),$('map-preview-overview').decode()]);
    if(epoch!==generation) { closePreview(); return; }
    $('map-note').textContent='';previewDialog.showModal();
  } catch {
    if(epoch===generation) { closePreview();$('map-note').textContent='Preview unavailable. Please try again.'; }
  } finally { previewRunning=false;$('map-preview').disabled=false; }
});
async function applyMap(value) {
  if (!canEdit()) { dialog.close(); return; }
  const epoch=generation;
  $('map-apply').disabled=true;
  $('map-note').textContent='Submitting map…';
  try {
    const response=await request('/map',value);
    if(epoch!==generation) return;
    if(response.status===401) { dialog.close(); return; }
    const result=await response.json();
    $('map-note').textContent=result.error||result.message;
    $('map-apply').disabled=response.status===202;
    if(response.status===202) {
      window.dispatchEvent(new Event('map-update-started'));
      dialog.close();
    }
  } catch {
    if(epoch===generation) { $('map-note').textContent='Could not confirm map update. Reopen settings to check.'; $('map-apply').disabled=false; }
  }
}
$('map-form').addEventListener('submit', event=>{
  event.preventDefault();
  if(!previewRunning) void applyMap(mapValues());
});
$('map-preview-apply').addEventListener('click',()=>{
  const values=previewValues;
  closePreview();
  if(values) void applyMap(values);
});

let pinToggleTouched = false;
function updatePinSave() {
  $('settings-pin-save').hidden = !configured && (!pinToggleTouched || !$('settings-pin-enabled').checked);
}
function resetPinForm() {
  pinToggleTouched = false;
  $('settings-pin-enabled').checked = configured;
  newPinEntry.clear();
  confirmPinEntry.clear();
  $('settings-pin-note').textContent = '';
  $('settings-pin-save').disabled = false;
  updatePinInputs();
  updatePinSave();
}
function updatePinInputs() {
  const enabled = $('settings-pin-enabled').checked;
  $('settings-pin-inputs').hidden = !enabled;
  for (const entry of [newPinEntry, confirmPinEntry]) {
    entry.setEnabled(enabled);
    if (!enabled) entry.clear();
  }
}
$('settings-pin-enabled').addEventListener('change', () => { pinToggleTouched = true; updatePinInputs(); updatePinSave(); });
$('settings-new-pin').addEventListener('input', updatePinSave);
$('settings-pin-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!canEdit()) { dialog.close(); return; }
  if ($('settings-pin-save').hidden || $('settings-pin-save').disabled || !$('settings-pin-form').reportValidity()) return;
  const enabled = $('settings-pin-enabled').checked;
  const value = newPinEntry.value();
  const confirmation = confirmPinEntry.value();
  if (enabled && (!/^[0-9]{6}$/.test(value) || !/^[0-9]{6}$/.test(confirmation))) { $('settings-pin-note').textContent = 'Enter six digits in each row.'; return; }
  if (enabled && value !== confirmation) { $('settings-pin-note').textContent = 'PINs do not match.'; confirmPinEntry.invalid(); return; }
  const epoch = generation;
  $('settings-pin-save').disabled = true;
  $('settings-pin-note').textContent = 'Saving…';
  try {
    const response = await request('/pin', { enabled, ...(enabled ? { pin: value, confirmation } : {}) });
    if (epoch !== generation) return;
    if (response.status === 401) { dialog.close(); return; }
    const result = await response.json();
    if (epoch !== generation) return;
    if (!response.ok) { $('settings-pin-note').textContent = result.error || 'Could not save. Please try again.'; return; }
    settingsIdle.clear();
    token = null; unlockedUntil = 0; configured = result.configured;
    resetPinForm();
    if (configured) { dialog.close(); return; }
    settingsIdle.start();
    $('settings-pin-note').textContent = 'Saved';
  } catch {
    if (epoch === generation) $('settings-pin-note').textContent = 'Save could not be confirmed. Reopen settings to check.';
  } finally { if (epoch === generation) $('settings-pin-save').disabled = false; }
});
