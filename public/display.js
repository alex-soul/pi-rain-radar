const preferences = { showScale: true, autoHide: false, autoHideWeather: false, gustCacheMinutes: 60 };
try {
  const saved = JSON.parse(localStorage.getItem('radar-display'));
  for (const key of ['showScale', 'autoHide', 'autoHideWeather']) if (typeof saved?.[key] === 'boolean') preferences[key] = saved[key];
  if (Number.isInteger(saved?.gustCacheMinutes) && saved.gustCacheMinutes >= 1 && saved.gustCacheMinutes <= 1440) preferences.gustCacheMinutes = saved.gustCacheMinutes;
} catch { /* Defaults also work without browser storage. */ }

export function gustCacheMinutes() { return preferences.gustCacheMinutes; }

let footerHidden = false;

// Auto-hide reserves no permanent footer space, even while the footer is visible.
export function widgetBottom() {
  return preferences.autoHide || footerHidden ? innerHeight : document.querySelector('footer').getBoundingClientRect().top;
}

export function setupWidgetLayer(panel) {
  const raise = () => {
    for (const id of ['overview', 'minutecast']) {
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
  const gear = document.getElementById('settings-toggle');
  const footerToggle = document.getElementById('footer-toggle');
  const content = [...footer.querySelectorAll('.observation, .playback, .source, #radar-status')];
  let timer;
  const pointers = new Set();
  function hidden(value) {
    footerHidden = value;
    footerToggle.setAttribute('aria-expanded', String(!value));
    document.body.classList.toggle('footer-hidden', value);
    for (const item of content) item.inert = value;
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
    if (preferences.autoHide && !event?.target?.closest('#footer-toggle')) hidden(false);
    if (preferences.autoHideWeather && !event?.target?.closest('#weather-dock')) weatherExpanded(true);
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
    if (!Number.isInteger(value) || value < 1 || value > 1440) { gustMinutes.reportValidity(); return; }
    preferences.gustCacheMinutes = value;
    try { localStorage.setItem('radar-display', JSON.stringify(preferences)); } catch { /* Session-only fallback. */ }
    window.dispatchEvent(new Event('radar-gust-cache-change'));
  });
  // Wake after the tap target is resolved, so attached controls cannot move away mid-tap.
  document.addEventListener('click', wake, true);
  document.addEventListener('keydown', wake, true);
  document.addEventListener('pointerdown', event => { pointers.add(event.pointerId); clearTimeout(timer); }, true);
  for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, event => {
    pointers.delete(event.pointerId); schedule();
  }, true);
  window.addEventListener('blur', () => { pointers.clear(); schedule(); });
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
  new ResizeObserver(size).observe(footer);
  window.addEventListener('resize', size);
  size(); apply();
}
