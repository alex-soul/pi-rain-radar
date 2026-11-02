export function statsSnapshot({status, reachable, receivedAt}, now = Date.now()) {
  const stale = !reachable || !receivedAt || now - receivedAt > 45000;
  return {
    stale,
    connection: !receivedAt ? 'Waiting…' : stale ? 'Offline / stale' : 'Connected',
    sources: status?.sources ?? {},
    aviation: status?.aviation,
    weather: status?.weather,
    camera:status?.camera,
    now: (status?.serverTime ?? receivedAt ?? now) + Math.max(0, now - (receivedAt ?? now)),
  };
}
