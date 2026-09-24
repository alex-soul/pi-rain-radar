// Publication grace applies only to Live, never to stored Archive windows.
export function liveDueThrough(clockSeconds) {
  return Math.floor((clockSeconds - 300) / 600) * 600;
}

export function classifyCoverage(coverage, pendingTime = null) {
  // Only the newest Live slot gets publication grace; Archive passes no endpoint.
  coverage = coverage.map(slot => ({ ...slot, pending: slot.time === pendingTime }));
  const counts = Object.fromEntries(['main', 'overview'].map(role => [role, {
    available: coverage.filter(slot => slot[role]).length,
    missing: coverage.filter(slot => !slot[role] && !slot.pending && slot.sources?.[role]!=='disabled').length,
  }]));
  return { coverage, counts, complete: coverage.length > 0 && coverage.every(slot => slot.pending || (['main','overview'].every(role=>slot.sources?.[role]==='disabled'||slot[role]))) };
}

// Continue aging even if the server goes away; an outage must not stay green.
export function ageLiveCoverage(coverage, start, end, dueThrough) {
  const slots = new Map((coverage ?? []).filter(slot => slot.time >= start && slot.time <= end).map(slot => [slot.time, slot]));
  for (let time = Math.ceil(start / 600) * 600; time <= end; time += 600)
    if (!slots.has(time)) slots.set(time, { time, main: false, overview: false, sources:coverage?.at(-1)?.sources });
  return classifyCoverage([...slots.values()].sort((a, b) => a.time - b.time), dueThrough);
}
