export function setupDiagnostics(dialog, request, canEdit) {
  const panel = document.getElementById('settings-panel-log');
  const output = document.getElementById('diagnostic-events');
  const note = document.getElementById('diagnostic-note');
  const timeZone = document.querySelector('meta[name="time-zone"]').content;
  let timer, generation = 0;
  const visible = () => canEdit() && !document.hidden && !panel.hidden && !panel.closest('[hidden]');
  async function update(epoch) {
    if (!visible() || epoch !== generation) return;
    try {
      const response = await request('/diagnostics');
      if (!visible() || epoch !== generation) return;
      if (response.status === 401) { dialog.close(); return; }
      if (!response.ok) throw new Error();
      const { events, limit } = await response.json();
      if (!visible() || epoch !== generation) return;
      const follow = output.scrollHeight - output.scrollTop - output.clientHeight < 30;
      const rows = events.map(event => {
        const row = document.createElement('div'); row.className = `diagnostic-event ${event.severity}`;
        const time = document.createElement('time'); time.dateTime = event.lastAt;
        time.textContent = new Date(event.lastAt).toLocaleTimeString('en-GB', { hour12: false, timeZone });
        time.title = `First: ${new Date(event.time).toLocaleString('en-GB', {timeZone})} · Latest: ${new Date(event.lastAt).toLocaleString('en-GB', {timeZone})}`;
        const label = document.createElement('span'); label.className = 'diagnostic-source';
        label.textContent = `${event.severity.toUpperCase()} / ${event.source}`;
        const message = document.createElement('span'); message.className = 'diagnostic-message';
        message.textContent = event.message + (event.count > 1 ? ` ×${event.count}` : '');
        row.append(time, label, message); return row;
      });
      output.replaceChildren(...rows);
      if (follow) output.scrollTop = output.scrollHeight;
      note.textContent = `Last ${limit} events since restart`;
    } catch {
      if (visible() && epoch === generation) note.textContent = 'Cannot refresh events. Retrying shortly.';
    } finally {
      if (visible() && epoch === generation) timer = setTimeout(() => update(epoch), 10000);
    }
  }
  function sync() {
    clearTimeout(timer); generation++;
    if (visible()) void update(generation);
  }
  dialog.addEventListener('settings-tab-change', sync);
  dialog.addEventListener('close', sync);
  document.addEventListener('visibilitychange', sync);
  return sync;
}
