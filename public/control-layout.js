const controls = [
  { id: 'clock-toggle', label: 'Clock' },
  { id: 'overview-toggle', label: 'Overview' },
  { id: 'minutecast-toggle', label: 'MinuteCast' },
  { id: 'history-toggle', label: 'History' },
  { id: 'theme-toggle', label: 'Light / dark' },
];
const key = 'radar-controls';
let layout = controls.map(({ id }) => ({ id, visible: true }));
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (Array.isArray(saved)) {
    const ids = new Set();
    const valid = saved.filter(item => item && controls.some(c => c.id === item.id) &&
      typeof item.visible === 'boolean' && !ids.has(item.id) && ids.add(item.id));
    layout = [...valid.map(({ id, visible }) => ({ id, visible })), ...layout.filter(item => !ids.has(item.id))];
  }
} catch { /* Use defaults if storage is unavailable or invalid. */ }
function apply() {
  const stack = document.querySelector('.map-controls');
  for (const { id, visible } of layout) {
    const button = document.getElementById(id);
    button.hidden = !visible;
    stack.append(button);
  }
}
apply();

export function setupControlEditor(canEdit) {
  const list = document.getElementById('control-list');
  const feedback = document.getElementById('control-feedback');
  let drag = null;
  function save() {
    apply();
    try { localStorage.setItem(key, JSON.stringify(layout)); feedback.textContent = 'Saved on this screen'; }
    catch { feedback.textContent = 'Applied for now; browser storage is unavailable.'; }
  }
  function render() {
    list.replaceChildren();
    for (const { id, visible } of layout) {
      const label = controls.find(c => c.id === id).label;
      const row = document.createElement('li'); row.dataset.control = id;
      const handle = document.createElement('button');
      handle.type = 'button'; handle.className = 'control-handle'; handle.textContent = '⠿';
      handle.setAttribute('aria-label', `Move ${label}. Drag or use up and down arrow keys.`);
      const name = document.createElement('span'); name.textContent = label;
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = visible;
      toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', `Show ${label} button`);
      toggle.className = 'control-switch';
      toggle.addEventListener('change', () => {
        if (!canEdit()) { toggle.checked = !toggle.checked; return; }
        layout.find(c => c.id === id).visible = toggle.checked; save();
      });
      handle.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !canEdit()) return;
        event.preventDefault();
        const from = layout.findIndex(c => c.id === id);
        const to = Math.max(0, Math.min(layout.length - 1, from + (event.key === 'ArrowUp' ? -1 : 1)));
        if (from !== to) {
          layout.splice(to, 0, layout.splice(from, 1)[0]); save(); render();
          list.querySelector(`[data-control="${id}"] button`).focus();
        }
      });
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary || !canEdit()) return;
        drag = { pointer: event.pointerId, id, original: layout.map(item => ({ ...item })) };
        row.classList.add('dragging'); handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener('pointermove', event => {
        if (drag?.pointer !== event.pointerId || !canEdit()) return;
        const rows = [...list.children];
        const other = rows.find(r => {
          const rect = r.getBoundingClientRect();
          return r !== row && event.clientY >= rect.top && event.clientY <= rect.bottom;
        });
        if (!other) return;
        const from = layout.findIndex(c => c.id === id);
        const to = layout.findIndex(c => c.id === other.dataset.control);
        layout.splice(to, 0, layout.splice(from, 1)[0]);
        // Move the other row, preserving pointer capture on the dragged handle.
        layout.forEach((item, index) => {
          if (item.id === id) return;
          const sibling = rows.find(r => r.dataset.control === item.id);
          if (index < to) list.insertBefore(sibling, row);
          else list.append(sibling);
        });
      });
      function finish(event) {
        if (drag?.pointer !== event.pointerId) return;
        const original = drag.original;
        drag = null; row.classList.remove('dragging');
        if (event.type === 'pointerup' && canEdit()) save();
        else layout = original;
        render();
      }
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
      handle.addEventListener('lostpointercapture', finish);
      row.append(handle, name, toggle); list.append(row);
    }
  }
  render();
  return () => {
    if (drag) { layout = drag.original; drag = null; render(); }
    feedback.textContent = '';
  };
}

export function setupResponsiveControls() {
  const stack = document.querySelector('.map-controls');
  const dock = document.getElementById('weather-dock');
  const pointers = new Set();
  let queued;
  function update() {
    queued = null;
    if (pointers.size) return;
    const controls = stack.getBoundingClientRect(), weather = dock.getBoundingClientRect();
    const previous = parseFloat(stack.style.getPropertyValue('--controls-offset')) || 0;
    const naturalTop = controls.top - previous;
    const collide = controls.left < weather.right + 8 && controls.right > weather.left - 8;
    const offset = collide ? Math.max(0, weather.bottom + 12 - naturalTop) : 0;
    stack.style.setProperty('--controls-offset', `${offset}px`);
  }
  function schedule() { if (!queued) queued = requestAnimationFrame(update); }
  const resize = new ResizeObserver(schedule); resize.observe(stack); resize.observe(dock);
  new MutationObserver(schedule).observe(dock, {attributes:true, attributeFilter:['class','aria-expanded']});
  window.addEventListener('resize', schedule);
  document.addEventListener('pointerdown', event => { pointers.add(event.pointerId); }, true);
  for (const event of ['pointerup','pointercancel']) document.addEventListener(event, e => { pointers.delete(e.pointerId); schedule(); }, true);
  window.addEventListener('blur', () => { pointers.clear(); schedule(); });
  schedule();
}
