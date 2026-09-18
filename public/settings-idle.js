// Renew only after deliberate Settings activity, at most once per 30 seconds.
export function setupSettingsIdle({active, protectedSession, renew, close, now = Date.now, schedule = setTimeout, cancel = clearTimeout}) {
  const idleMs = 300000, interval = 30000;
  let deadline = 0, expiry = 0, lastSent = 0, timer, pending, running = false, generation = 0;
  function clear() {
    generation++; cancel(timer); cancel(pending); pending = undefined; running = false; deadline = 0;
  }
  function arm() {
    cancel(timer);
    const end = protectedSession() ? Math.min(deadline, expiry) : deadline;
    timer = schedule(() => { if (active()) close(); }, Math.max(0, end - now()));
  }
  async function send() {
    pending = undefined;
    if (!active() || !deadline || running) return;
    if (now() >= expiry || now() >= deadline) { close(); return; }
    const epoch = generation;
    running = true; lastSent = now();
    try {
      const next = await renew();
      if (epoch !== generation) return;
      if (!Number.isFinite(next) || next <= now()) throw new Error('Expired session');
      expiry = next; arm();
    } catch { if (epoch === generation && active()) close(); }
    finally { if (epoch === generation) running = false; }
  }
  function start(serverExpiry = 0) {
    clear(); deadline = now() + idleMs; expiry = serverExpiry; lastSent = now(); arm();
  }
  function activity() {
    if (!active() || !deadline) return;
    if (now() >= deadline || (protectedSession() && now() >= expiry)) { close(); return; }
    deadline = now() + idleMs; arm();
    if (protectedSession() && pending === undefined) {
      const delay = Math.max(0, interval - (now() - lastSent));
      if (!delay && !running) void send();
      else pending = schedule(send, Math.max(1, delay));
    }
  }
  return {start, activity, clear};
}
