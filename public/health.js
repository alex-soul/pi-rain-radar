// Acquisition health is independent of the frame selected for playback.
export function radarSourceHealth(source, reachable = true, now = Date.now()) {
  if (!reachable) return ['error', 'Appliance unreachable'];
  if (!source) return ['warning', 'Waiting for first acquisition'];
  if (!Number.isFinite(source.time)) {
    if (!source.error && (source.fetching || !source.checkedAt)) return ['warning', 'Waiting for first acquisition'];
    return ['error', source.error || 'No usable radar data'];
  }
  if (source.time * 1000 <= now - 1800000) return ['error', 'Radar data is stale'];
  if (source.error || source.state === 'warning') return ['warning', source.error || 'Radar update delayed'];
  if (source.state !== 'ready') return ['warning', 'Waiting for radar update'];
  return ['ready', 'Connected'];
}

export function worstHealth(states) {
  return states.find(([level]) => level === 'error')
    || states.find(([level]) => level === 'warning') || states[0];
}
