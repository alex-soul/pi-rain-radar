import { defaultReadings, readingNames, windUnits, playbackSpeeds, weatherOptions } from './weather-format.js';
const gustChoices = [0, 15, 30, 45, 60, 90, 120, 180];
function normalizeGust(value) {
  if (value === 0) return 0;
  if (!Number.isInteger(value) || value < 1) return 60;
  return gustChoices.slice(1).reduce((best, pick) => Math.abs(pick-value) < Math.abs(best-value) ? pick : best, 15);
}
const preferences = { showScale: true, autoHide: false, autoHideWeather: false, gustCacheMinutes: 60, temperatureUnit: 'C', windUnit: 'mph', visibilityUnit: 'km', pressureUnit: 'hPa', directionFormat: 'compass', directionConvention: 'flow', readings: [...defaultReadings], playbackSpeed: 1, playbackHours: 2 };
preferences.readingOrder = Object.keys(readingNames);
try {
  const saved = JSON.parse(localStorage.getItem('radar-display'));
  for (const key of ['showScale', 'autoHide', 'autoHideWeather']) if (typeof saved?.[key] === 'boolean') preferences[key] = saved[key];
  preferences.gustCacheMinutes = normalizeGust(saved?.gustCacheMinutes);
  if (['C', 'F'].includes(saved?.temperatureUnit)) preferences.temperatureUnit = saved.temperatureUnit;
  for (const [key, values] of Object.entries(weatherOptions)) if (values.includes(saved?.[key])) preferences[key] = saved[key];
  if (Object.hasOwn(windUnits, saved?.windUnit)) preferences.windUnit = saved.windUnit;
  if (Array.isArray(saved?.readings)) preferences.readings = Object.keys(readingNames).filter(key => saved.readings.includes(key));
  if (Array.isArray(saved?.readingOrder)) preferences.readingOrder = [...new Set([...saved.readingOrder.filter(key => Object.hasOwn(readingNames, key)), ...Object.keys(readingNames)])];
  if (playbackSpeeds.includes(saved?.playbackSpeed)) preferences.playbackSpeed = saved.playbackSpeed;
  if ([2,4,6].includes(saved?.playbackHours)) preferences.playbackHours = saved.playbackHours;
} catch { /* Defaults also work without browser storage. */ }

export function gustCacheMinutes() { return preferences.gustCacheMinutes; }
export function weatherPreferences() { return { temperatureUnit: preferences.temperatureUnit, windUnit: preferences.windUnit, readings: [...preferences.readings], ...Object.fromEntries(Object.keys(weatherOptions).map(key => [key, preferences[key]])) }; }
export function playbackSpeed() { return preferences.playbackSpeed; }
export function playbackHours() { return preferences.playbackHours; }

export function setupReadingEditor(canEdit) {
  const list = document.getElementById('reading-list');
  const feedback = document.getElementById('reading-feedback');
  const rows = new Map([...list.children].map(row => [row.dataset.readingRow, row]));
  let drag;
  function arrange() { for (const id of preferences.readingOrder) list.append(rows.get(id)); }
  function save() {
    try { localStorage.setItem('radar-display', JSON.stringify(preferences)); feedback.textContent = 'Saved on this screen'; }
    catch { feedback.textContent = 'Applied for now; browser storage is unavailable.'; }
    window.dispatchEvent(new Event('radar-reading-order'));
  }
  function cancel() {
    if (drag) { preferences.readingOrder = drag.original; rows.get(drag.id).classList.remove('dragging'); drag = null; arrange(); }
    feedback.textContent = '';
  }
  for (const [id,row] of rows) {
    const handle = row.querySelector('.control-handle');
    handle.addEventListener('keydown', event => {
      if (!canEdit() || !['ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const from = preferences.readingOrder.indexOf(id);
      const to = Math.max(0, Math.min(rows.size - 1, from + (event.key === 'ArrowUp' ? -1 : 1)));
      preferences.readingOrder.splice(to, 0, preferences.readingOrder.splice(from, 1)[0]);
      arrange(); handle.focus(); save();
    });
    handle.addEventListener('pointerdown', event => {
      if (!canEdit() || event.button !== 0 || !event.isPrimary) return;
      drag = {id, pointer:event.pointerId, original:[...preferences.readingOrder]};
      handle.setPointerCapture(event.pointerId); row.classList.add('dragging');
    });
    handle.addEventListener('pointermove', event => {
      if (drag?.pointer !== event.pointerId || !canEdit()) return;
      const other = [...list.children].find(item => {
        const rect = item.getBoundingClientRect();
        return item !== row && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      });
      if (!other) return;
      const from = preferences.readingOrder.indexOf(id), to = preferences.readingOrder.indexOf(other.dataset.readingRow);
      preferences.readingOrder.splice(to, 0, preferences.readingOrder.splice(from, 1)[0]);
      // Move siblings only, preserving capture on the dragged handle.
      preferences.readingOrder.forEach((key,index) => { if (key !== id) index < to ? list.insertBefore(rows.get(key),row) : list.append(rows.get(key)); });
    });
    function finish(event) {
      if (drag?.pointer !== event.pointerId) return;
      if (event.type !== 'pointerup' || !canEdit()) { cancel(); return; }
      drag = null; row.classList.remove('dragging'); arrange(); save();
    }
    for (const name of ['pointerup','pointercancel','lostpointercapture']) handle.addEventListener(name,finish);
  }
  arrange(); return cancel;
}

let footerHidden = false;

// Widgets use the whole viewport regardless of dock visibility.
export function widgetBottom() {
  return innerHeight;
}

export function setupWidgetLayer(panel) {
  const raise = () => {
    for (const id of ['overview', 'rain-forecast', 'stats']) {
      const widget = document.getElementById(id);
      widget.classList.toggle('widget-front', widget === panel);
    }
  };
  // Change stacking without disturbing position, focus or pointer capture.
  for (const event of ['pointerdown', 'click', 'focusin']) panel.addEventListener(event, raise);
  return raise;
}

// Screen preferences affect only presentation, never acquisition or map rendering.
export function setupDisplaySettings(canEdit) {
  const footer = document.querySelector('footer');
  const scale = document.getElementById('map-scale');
  const showScale = document.getElementById('show-map-scale');
  const autoHide = document.getElementById('auto-hide-footer');
  const autoWeather = document.getElementById('auto-hide-weather');
  const gustMinutes = document.getElementById('gust-cache-minutes');
  const tempUnit = document.getElementById('temperature-unit');
  const windUnit = document.getElementById('wind-unit');
  const extraUnits = Object.entries(weatherOptions).map(([key,valid]) => [document.getElementById(key.replace(/[A-Z]/g, letter => '-'+letter.toLowerCase())), key, valid]);
  const speed = document.getElementById('playback-speed');
  const hours = document.getElementById('playback-hours');
  const readings = [...document.querySelectorAll('[data-reading-choice]')];
  const persist = () => { try { localStorage.setItem('radar-display', JSON.stringify(preferences)); } catch { /* Session-only fallback. */ } };
  hours.value = String(preferences.playbackHours);
  hours.addEventListener('change', () => {
    const value = Number(hours.value);
    if (canEdit() && [2,4,6].includes(value)) {
      preferences.playbackHours = value; persist(); window.dispatchEvent(new Event('radar-playback-window'));
    }
    hours.value = String(preferences.playbackHours);
  });
  function applyWeatherChoices() {
    tempUnit.value = preferences.temperatureUnit;
    windUnit.value = preferences.windUnit;
    for (const [input,key] of extraUnits) input.value = preferences[key];
    for (const input of readings) input.checked = preferences.readings.includes(input.dataset.readingChoice);
    for (const key of preferences.readingOrder) {
      const row = document.getElementById(`weather-${key}`).closest('.weather-reading');
      row.hidden = !preferences.readings.includes(key);
      row.parentElement?.append(row);
    }
    document.getElementById('weather-dock').classList.toggle('no-readings', !preferences.readings.length);
    window.dispatchEvent(new Event('radar-weather-preferences'));
  }
  window.addEventListener('radar-reading-order', applyWeatherChoices);
  for (const [input, key, valid] of [[tempUnit, 'temperatureUnit', ['C','F']], [windUnit, 'windUnit', Object.keys(windUnits)], ...extraUnits]) input.addEventListener('change', () => {
    if (canEdit() && valid.includes(input.value)) { preferences[key] = input.value; persist(); }
    applyWeatherChoices();
  });
  for (const input of readings) input.addEventListener('change', () => {
    if (canEdit()) { preferences.readings = readings.filter(item => item.checked).map(item => item.dataset.readingChoice); persist(); }
    applyWeatherChoices();
  });
  function applySpeed() {
    speed.value = playbackSpeeds.indexOf(preferences.playbackSpeed);
    speed.setAttribute('aria-valuetext', `${preferences.playbackSpeed} times normal speed`);
    document.getElementById('playback-speed-value').textContent = `${preferences.playbackSpeed}×`;
  }
  speed.addEventListener('input', () => {
    const value = playbackSpeeds[Number(speed.value)];
    if (canEdit() && value) { preferences.playbackSpeed = value; persist(); window.dispatchEvent(new Event('radar-playback-speed')); }
    applySpeed();
  });
  applyWeatherChoices(); applySpeed();
  const gear = document.getElementById('settings-toggle');
  const footerToggle = document.getElementById('footer-toggle');
  const content = [...footer.querySelectorAll('.observation, .playback')];
  let timer;
  const pointers = new Set();
  function hidden(value) {
    footerHidden = value;
    footerToggle.setAttribute('aria-expanded', String(!value));
    document.body.classList.toggle('footer-hidden', value);
    for (const item of content) item.inert = value || document.body.classList.contains('screen-locked');
  }
  function schedule() {
    clearTimeout(timer);
    if (document.hidden || pointers.size || document.querySelector('dialog[open]')) return;
    timer = setTimeout(() => {
      gear.hidden = true;
      if (preferences.autoHide) hidden(true);
      if (preferences.autoHideWeather) weatherExpanded(false);
    }, 15_000);
  }
  function weatherExpanded(expanded) {
    window.dispatchEvent(new CustomEvent('radar-weather-expanded', { detail: expanded }));
  }
  function wake(event) {
    gear.hidden = false;
    if (preferences.autoHide && !event?.target?.closest?.('#footer-toggle')) hidden(false);
    if (preferences.autoHideWeather && !event?.target?.closest?.('#weather-dock')) weatherExpanded(true);
    schedule();
  }
  footerToggle.addEventListener('click', () => { hidden(!footerHidden); schedule(); });
  function apply() {
    scale.toggleAttribute('hidden', !preferences.showScale);
    showScale.checked = preferences.showScale;
    autoHide.checked = preferences.autoHide;
    autoWeather.checked = preferences.autoHideWeather;
    gustMinutes.value = preferences.gustCacheMinutes;
    hidden(false);
    if (preferences.autoHideWeather) weatherExpanded(true);
    schedule();
    window.dispatchEvent(new Event('radar-display-change'));
  }
  for (const [input, key] of [[showScale, 'showScale'], [autoHide, 'autoHide'], [autoWeather, 'autoHideWeather']]) {
    input.addEventListener('change', () => {
      if (canEdit()) {
        preferences[key] = input.checked;
        try { localStorage.setItem('radar-display', JSON.stringify(preferences)); } catch { /* Session-only fallback. */ }
      }
      apply();
    });
  }
  gustMinutes.addEventListener('change', () => {
    if (!canEdit()) { gustMinutes.value = preferences.gustCacheMinutes; return; }
    const value = Number(gustMinutes.value);
    if (gustMinutes.value === '' || !gustChoices.includes(value)) { gustMinutes.reportValidity(); return; }
    preferences.gustCacheMinutes = value;
    try { localStorage.setItem('radar-display', JSON.stringify(preferences)); } catch { /* Session-only fallback. */ }
    window.dispatchEvent(new Event('radar-gust-cache-change'));
  });
  // Wake after the tap target is resolved, so attached controls cannot move away mid-tap.
  document.addEventListener('click', wake, true);
  document.addEventListener('keydown', wake, true);
  window.addEventListener('radar-settings-wake', wake);
  document.addEventListener('pointerdown', event => { pointers.add(event.pointerId); clearTimeout(timer); }, true);
  for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, event => {
    pointers.delete(event.pointerId); schedule();
  }, true);
  window.addEventListener('blur', () => { pointers.clear(); schedule(); });
  window.addEventListener('radar-screen-lock', () => { pointers.clear(); schedule(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(timer); gear.hidden = true; }
    else schedule();
  });
  const dialogs = new MutationObserver(wake);
  for (const dialog of document.querySelectorAll('dialog')) dialogs.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  function size() {
    document.body.style.setProperty('--footer-height', `${footer.offsetHeight}px`);
    // Match the main SVG's xMidYMid slice scale, including cropped portrait views.
    const factor = Math.max(innerWidth / 1280, innerHeight / 720);
    scale.style.width = `${Number(scale.dataset.width) * factor}px`;
    scale.style.height = `${32 * factor}px`;
  }
  const attribution = document.querySelector('.source');
  new ResizeObserver(() => {
    document.body.style.setProperty('--attribution-height', `${attribution.offsetHeight}px`);
  }).observe(attribution);
  new ResizeObserver(size).observe(footer);
  window.addEventListener('resize', size);
  size(); apply();
}
