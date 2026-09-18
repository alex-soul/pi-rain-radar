const storageKey = 'radar-screen-locked';
let locked = false;
try { locked = localStorage.getItem(storageKey) === 'true'; } catch { /* Session-only fallback. */ }
export function screenLocked() { return locked; }

const blockedLinks = new Map();
function paint() {
  document.body.classList.toggle('screen-locked', locked);
  for (const link of document.querySelectorAll('a[href], a[data-locked-link]')) {
    if (link.matches('[data-provider-credit], #external-open')) continue;
    if (locked && link.hasAttribute('href')) {
      blockedLinks.set(link, {href:link.getAttribute('href'), tabindex:link.getAttribute('tabindex')});
      link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true');
      link.dataset.lockedLink = ''; link.tabIndex = -1;
    } else if (!locked && blockedLinks.has(link)) {
      const saved = blockedLinks.get(link); link.setAttribute('href', saved.href);
      if (saved.tabindex === null) link.removeAttribute('tabindex'); else link.setAttribute('tabindex', saved.tabindex);
      link.removeAttribute('aria-disabled'); delete link.dataset.lockedLink; blockedLinks.delete(link);
    }
  }
  for (const selector of ['.map-controls','#weather-dock','.playback','#overview','#rain-forecast','#footer-toggle']) {
    document.querySelector(selector).inert = locked || (selector === '.playback' && document.body.classList.contains('footer-hidden'));
  }
}

function guard(event) {
  if (!locked) return;
  const target = event.target;
  if (target.closest?.('#settings-dialog, #map-preview-dialog, #external-dialog, #settings-toggle, [data-provider-credit]')) return;
  if (event.type === 'click' || event.type === 'pointerdown' || event.type === 'keydown') {
    document.getElementById('settings-toggle').hidden = false;
    window.dispatchEvent(new Event('radar-settings-wake'));
  }
  // Tab still reaches Settings and required credit links. Browser shortcuts remain available.
  if (event.type === 'keydown' && (event.key === 'Tab' || event.ctrlKey || event.metaKey || event.altKey)) return;
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
}
for (const event of ['pointerdown','pointermove','pointerup','click','dblclick','auxclick','contextmenu','keydown','keyup','input','change','wheel','touchstart','touchmove','dragstart']) {
  window.addEventListener(event, guard, {capture:true, passive:false});
}

export function setupScreenLock(canEdit) {
  const toggle = document.getElementById('screen-lock');
  toggle.checked = locked;
  toggle.addEventListener('change', () => {
    if (!canEdit()) { toggle.checked = locked; return; }
    locked = toggle.checked;
    try { localStorage.setItem(storageKey, String(locked)); } catch { /* Session-only fallback. */ }
    window.dispatchEvent(new Event('radar-screen-lock'));
    paint();
  });
  paint();
}

// All outbound links use the same deliberate, keyboard-accessible kiosk warning.
// Keep native hover tooltips in sync, including credits and help links added later.
function updateLinkTooltip(link) {
  if (link.matches('a[href]') && /^https?:/.test(link.href)) link.title = link.href;
}
document.querySelectorAll('a[href]').forEach(updateLinkTooltip);
new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'attributes') updateLinkTooltip(record.target);
    else for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      updateLinkTooltip(node);
      node.querySelectorAll('a[href]').forEach(updateLinkTooltip);
    }
  }
}).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['href']});

const external = document.getElementById('external-dialog');
const openLink = document.getElementById('external-open');
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[href]');
  if (!link || link === openLink || !/^https?:/.test(link.href)) return;
  event.preventDefault(); event.stopPropagation();
  openLink.href = link.href;
  document.getElementById('external-destination').textContent = new URL(link.href).hostname;
  external.showModal(); document.getElementById('external-cancel').focus();
}, true);
for (const name of ['auxclick','contextmenu','dragstart']) document.addEventListener(name, event => {
  if (event.target.closest?.('a')) event.preventDefault();
}, true);
document.getElementById('external-cancel').addEventListener('click', () => external.close());
openLink.addEventListener('click', () => { setTimeout(() => external.close(), 0); });
external.addEventListener('close', () => openLink.removeAttribute('href'));
