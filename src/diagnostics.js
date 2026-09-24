// Only fixed, trusted messages enter this user-facing log. Never accept provider text.
const messages = {
  'cloud-collected': ['Clouds', 'info', 'Cloud frames stored.'],
  'cloud-recovered': ['Clouds', 'info', 'Cloud acquisition recovered.'],
  'camera-recovered': ['Camera', 'info', 'Fresh camera snapshots available again.'],
  'cloud-error': ['Clouds', 'warning', 'Cloud acquisition paused or unavailable. Check Clouds in Status and the Rainbow request allowance.'],
  'camera-collected': ['Camera', 'info', 'Camera snapshot stored.'],
  'camera-unchanged': ['Camera', 'info', 'Camera image unchanged. Keeping its original timestamp.'],
  'camera-stale': ['Camera', 'warning', 'Camera returned a snapshot more than ten minutes old.'],
  'camera-error': ['Camera', 'warning', 'Camera collection failed. Check Camera in Status; retrying on the next five-minute poll.'],
  'main-unavailable': ['Main radar', 'error', 'Radar observations unavailable or at least 30 minutes old.'],
  'main-available': ['Main radar', 'info', 'Usable data available again.'],
  'overview-unavailable': ['Overview radar', 'error', 'Radar observations unavailable or at least 30 minutes old.'],
  'overview-available': ['Overview radar', 'info', 'Usable data available again.'],
  'weather-unavailable': ['Current weather', 'error', 'Current weather unavailable or expired. Readings show dashes.'],
  'weather-available': ['Current weather', 'info', 'Usable data available again.'],
  'forecast-unavailable': ['Minute forecast', 'error', 'Forecast unavailable or expired. The chart shows a red baseline.'],
  'forecast-available': ['Minute forecast', 'info', 'Usable data available again.'],
  startup: ['System', 'info', 'Appliance started. Live events are kept until restart.'],
  'radar-start': ['Radar', 'info', 'Connecting to RainViewer.'],
  'radar-error': ['Radar', 'warning', 'Radar acquisition failed. Keeping available images; retrying on the next poll.'],
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
  'weather-error': ['Current weather', 'warning', 'Current weather update failed. Check the connection; retrying automatically.'],
  'forecast-error': ['Minute forecast', 'warning', 'The latest forecast could not be acquired. The chart shows a red baseline; retrying automatically.'],
  'forecast-gaps': ['Minute forecast', 'warning', 'The latest forecast contains missing minutes, shown in amber. Waiting for the next update.'],
  'weather-auth': ['Weather', 'error', 'OpenWeather rejected the key or One Call 4.0 access. Check the key and subscription.'],
  'weather-limit': ['Weather', 'warning', 'OpenWeather request limit reached. Waiting for the next scheduled retry.'],
  'weather-ready': ['Weather', 'info', 'Current weather and minute forecast connection ready.'],
  'weather-recovered': ['Weather', 'info', 'Current weather and minute forecast updates recovered.'],
  'weather-key': ['Weather', 'info', 'OpenWeather configuration changed.'],
  'settling-on': ['Radar', 'info', 'Radar settling enabled for the next acquisition.'],
  'settling-off': ['Radar', 'info', 'Radar settling disabled for the next acquisition.'],
  'storage-error': ['System', 'warning', 'Could not save cached data. The in-memory result is still available.'],
};
export function createDiagnostics({ now = Date.now } = {}) {
  const events = [];
  const unavailable = new Set();
  let sequence = 0;
  return {
    record(code) {
      // Successful polls stay quiet; report one recovery after a known failure.
      if(['cloud-error','camera-error','camera-stale'].includes(code))unavailable.add(code.split('-')[0]);
      if(['cloud-collected','camera-collected','camera-unchanged'].includes(code)){
        const source=code.split('-')[0];
        if(!unavailable.delete(source))return;
        code=source+'-recovered';
      }
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
