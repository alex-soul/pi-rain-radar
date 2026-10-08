// Surface dragging shares the settings order; no layout changes until release.
export function moveRelative(items, source, target, after, key = item => item) {
  const result = items.filter(item => key(item) !== source);
  const index = result.findIndex(item => key(item) === target);
  if (index < 0) return items;
  result.splice(index + Number(after), 0, items.find(item => key(item) === source));
  return result;
}

export function setupDirectReorder(root, items, canEdit, commit, vertical = false) {
  let drag, suppressUntil = 0;
  const marker = document.createElement('div');
  marker.className = 'direct-drop-marker'; marker.hidden = true;
  document.body.append(marker);
  for (const [id, element] of items) {
    element.dataset.reorderId = id;
    element.classList.add('direct-reorder-item');
  }
  function clear() {
    if (!drag) return;
    const previous = drag; drag = null;
    clearTimeout(previous.timer);
    previous.element.classList.remove('direct-dragging');
    marker.hidden = true;
    if (previous.active) suppressUntil = performance.now() + 700;
    if (previous.element.hasPointerCapture(previous.pointer)) previous.element.releasePointerCapture(previous.pointer);
  }
  function activate() {
    if (!drag || !canEdit()) { clear(); return; }
    drag.active = true;
    drag.element.setPointerCapture(drag.pointer);
    drag.element.classList.add('direct-dragging');
    window.dispatchEvent(new Event('weather-explanation-close'));
  }
  root.addEventListener('pointerdown', event => {
    if (drag || !event.isPrimary || event.button !== 0 || !canEdit()) return;
    const element = event.target.closest('[data-reorder-id]');
    if (!element || !root.contains(element)) return;
    drag = {element, id:element.dataset.reorderId, pointer:event.pointerId, x:event.clientX, y:event.clientY, touch:event.pointerType !== 'mouse'};
    if (drag.touch) drag.timer = setTimeout(activate, 450);
  });
  window.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!canEdit()) { clear(); return; }
    if (!drag.active) {
      if (Math.hypot(event.clientX-drag.x, event.clientY-drag.y) < 7) return;
      if (drag.touch) { clear(); return; }
      activate();
    }
    if (!drag) return;
    event.preventDefault();
    const bounds = root.getBoundingClientRect();
    drag.target = null; marker.hidden = true;
    if (event.clientX < bounds.left-20 || event.clientX > bounds.right+20 || event.clientY < bounds.top-20 || event.clientY > bounds.bottom+20) return;
    const candidates = [...items].filter(([,el]) => el !== drag.element && !el.hidden && el.getClientRects().length);
    let best, distance = Infinity;
    for (const [id, element] of candidates) {
      const rect = element.getBoundingClientRect();
      const dx = Math.max(rect.left-event.clientX, 0, event.clientX-rect.right);
      const dy = Math.max(rect.top-event.clientY, 0, event.clientY-rect.bottom);
      const score = dx*dx + dy*dy;
      if (score < distance) { best = {id, rect}; distance = score; }
    }
    if (!best) return;
    const {id,rect} = best;
    const after = vertical ? event.clientY > (rect.top+rect.bottom)/2 : event.clientX > (rect.left+rect.right)/2;
    drag.target = {id, after};
    Object.assign(marker.style, vertical
      ? {left:`${rect.left}px`,top:`${(after?rect.bottom:rect.top)-2}px`,width:`${rect.width}px`,height:'3px'}
      : {left:`${(after?rect.right:rect.left)-2}px`,top:`${rect.top}px`,width:'3px',height:`${rect.height}px`});
    marker.hidden = false;
  }, {passive:false});
  window.addEventListener('pointerup', event => {
    if (drag?.pointer !== event.pointerId) return;
    const previous = drag;
    clear();
    if (previous.active && previous.target && canEdit()) commit(previous.id, previous.target.id, previous.target.after);
  });
  for (const name of ['pointercancel','lostpointercapture']) root.addEventListener(name, event => { if (drag?.pointer === event.pointerId) clear(); });
  document.addEventListener('pointerdown', event => { if (drag && event.pointerId !== drag.pointer) clear(); }, true);
  root.addEventListener('click', event => {
    if (event.detail && performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  root.addEventListener('contextmenu', event => { if (drag || performance.now() < suppressUntil) event.preventDefault(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') clear(); });
  for (const name of ['blur','resize','radar-screen-lock']) window.addEventListener(name, clear);
  return clear;
}
