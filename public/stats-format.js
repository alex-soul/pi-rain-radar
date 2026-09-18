export function statsSnapshot({status, reachable, receivedAt, selected, hours, loading}, now = Date.now()) {
  const stale = !reachable || !receivedAt || now - receivedAt > 45000;
  return {
    stale,
    connection: !receivedAt ? 'Waiting for status…' : stale ? 'Backend unreachable or stale · last received data below' : 'Backend connected',
    sources: status?.sources ?? {},
    windowLabel: `${selected ? 'Archive' : 'Live'} · ${selected?.hours ?? hours} h${loading ? ' · loading selection…' : ''}`,
    end: selected?.end ?? status?.end,
    counts: (selected ?? status)?.counts,
    rainbow: status?.stats?.rainbow,
    weather: status?.weather,
    now: (status?.serverTime ?? receivedAt ?? now) + Math.max(0, now - (receivedAt ?? now)),
  };
}
