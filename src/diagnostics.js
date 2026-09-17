// Only fixed, trusted messages enter this user-facing log. Never accept provider text.
const messages = {
  startup: ['System', 'info', 'Appliance started. Live events are kept until restart.'],
  'radar-start': ['Radar', 'info', 'Connecting to RainViewer.'],
  'radar-error': ['Radar', 'error', 'Radar update incomplete. Keeping available images; retrying on the next poll.'],
  'radar-ready': ['Radar', 'info', 'Radar connection ready.'],
  'rainbow-key': ['Rainbow', 'info', 'Rainbow key configuration updated.'],
  'rainbow-key-error': ['Rainbow', 'warning', 'Rainbow key could not be validated or saved. Existing configuration is unchanged; check the message in API settings.'],
  'rainbow-error': ['Rainbow', 'warning', 'Rainbow acquisition is unavailable. Check source status and usage limits. Available images are retained.'],
  'rainbow-limit': ['Rainbow', 'warning', 'Rainbow request allowance reached. Downloads are paused; check the configured limit in API settings. Available images are retained.'],
  'radar-recovered': ['Radar', 'info', 'Radar updates recovered.'],
  'power-restart': ['Device Power', 'info', 'The helper accepted a device restart request.'],
  'power-shutdown': ['Device Power', 'info', 'The helper accepted a device shutdown request.'],
  'power-error': ['Device Power', 'warning', 'A power request could not be confirmed. Check the device and helper before retrying.'],
  'weather-start': ['Weather', 'info', 'Connecting to OpenWeather.'],
  'weather-error': ['Weather', 'error', 'Weather update failed. Check the connection; retrying automatically.'],
  'forecast-error': ['MinuteCast', 'warning', 'The latest forecast could not be acquired. The chart is cleared; retrying automatically.'],
  'forecast-gaps': ['MinuteCast', 'warning', 'The latest forecast contains missing minutes, shown in amber. Waiting for the next update.'],
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
