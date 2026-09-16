// Only fixed, trusted messages enter this user-facing log. Never accept provider text.
const messages = {
  startup: ['System', 'info', 'Appliance started. Live events are kept until restart.'],
  'radar-start': ['Radar', 'info', 'Connecting to RainViewer.'],
  'radar-error': ['Radar', 'error', 'Radar update incomplete. Keeping available images; retrying on the next poll.'],
  'radar-ready': ['Radar', 'info', 'Radar connection ready.'],
  'radar-recovered': ['Radar', 'info', 'Radar updates recovered.'],
  'weather-start': ['Weather', 'info', 'Connecting to OpenWeather.'],
  'weather-error': ['Weather', 'error', 'Weather or MinuteCast update failed. Keeping available data; retrying automatically.'],
  'weather-auth': ['Weather', 'error', 'OpenWeather rejected the key or One Call 4.0 access. Check the key and subscription.'],
  'weather-limit': ['Weather', 'warning', 'OpenWeather request limit reached. Waiting for the next scheduled retry.'],
  'weather-ready': ['Weather', 'info', 'Weather and MinuteCast connection ready.'],
  'weather-recovered': ['Weather', 'info', 'Weather and MinuteCast updates recovered.'],
  'weather-key': ['Weather', 'info', 'OpenWeather configuration changed.'],
  'settling-on': ['Radar', 'info', 'Radar settling enabled for the next acquisition.'],
  'settling-off': ['Radar', 'info', 'Radar settling disabled for the next acquisition.'],
  'storage-error': ['System', 'warning', 'Could not save cached data. The in-memory result is still available.'],
};
export function createDiagnostics({ now = Date.now } = {}) {
  const events = [];
  let sequence = 0;
  return {
    record(code) {
      if (!Object.hasOwn(messages, code)) return;
      const time = new Date(now()).toISOString();
      const last = events.at(-1);
      if (last?.code === code) {
        last.lastAt = time;
        last.count = Math.min(9999, last.count + 1);
        return;
      }
      const [source, severity, message] = messages[code];
      events.push({ id: ++sequence, code, source, severity, message, time, lastAt: time, count: 1 });
      if (events.length > 25) events.shift();
    },
    snapshot: () => ({ events: events.map(event => ({ ...event })), limit: 25 }),
  };
}
