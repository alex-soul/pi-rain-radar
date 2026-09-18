// Public, deliberately allowlisted counters. Never expose provider configuration.
export function localRainbowCounts(usage) {
  if (!usage || !/^\d{4}-\d{2}$/.test(usage.month) ||
      ![usage.requests, usage.tiles].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  return {month: usage.month, requests: usage.requests, tiles: usage.tiles};
}
