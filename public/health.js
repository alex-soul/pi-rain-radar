// Acquisition health is independent of the frame selected for playback.
export function radarSourceHealth(source, reachable = true, now = Date.now()) {
  if (!reachable) return ['error', 'Appliance unreachable'];
  if(source?.source==='disabled'||source?.state==='disabled'||source?.enabled===false)return ['unconfigured','Disabled'];
  if (!source) return ['warning', 'Waiting for first acquisition'];
  if (!Number.isFinite(source.time)) {
    if (!source.error && (source.fetching || !source.checkedAt)) return ['warning', 'Waiting for first acquisition'];
    return ['error', source.error || 'No usable radar data'];
  }
  if (source.time * 1000 <= now - 1800000) return ['error', 'Radar data is stale'];
  if (source.error) return ['warning', source.error];
  if (source.state === 'error') return ['error', 'Radar acquisition unavailable'];
  return ['ready', 'Connected'];
}

// The handle reports actionable acquisition health, not timeline completeness.
// Cloud timestamps are milliseconds; radar timestamps above are seconds.
export function cloudHandleHealth(state, reachable = true, now = Date.now()) {
  if (!reachable) return ['error', 'Appliance unreachable'];
  if (!state?.enabled) return ['unconfigured', 'Disabled'];
  const roles = state.map === 'both' ? ['main', 'overview'] : [state.map ?? 'main'];
  const times = roles.map(role => state.latest?.[role]);
  if (times.some(time => Number.isFinite(time) && time <= now - 1800000)) return ['error', 'Cloud data is stale'];
  if (state.state === 'budget') return ['warning', 'Cloud budget paused'];
  if (state.error || state.state === 'error') return ['error', state.error || 'Cloud acquisition unavailable'];
  if (times.some(time => !Number.isFinite(time))) {
    return state.lastSuccess ? ['error', 'No usable cloud data'] : ['warning', 'Waiting for first cloud acquisition'];
  }
  return ['ready', 'Connected'];
}

export function worstHealth(states) {
  return states.find(([level]) => level === 'error')
    || states.find(([level]) => level === 'warning') || states.find(([level])=>level==='ready') || states[0];
}
