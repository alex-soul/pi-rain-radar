import { readdir } from 'node:fs/promises';

export const HISTORY_DAYS = 7;
export const HISTORY_SECONDS = HISTORY_DAYS * 86400;
export const CLEANUP_BUFFER_SECONDS = 3600;
export const WINDOW_SECONDS = 7200;

// The PNG filenames are the durable index. Read them once on startup, then update
// this small in-memory index when complete pairs are acquired or cleaned up.
export async function createArchive(directory, viewKey, overviewKey, now = Date.now) {
  const pairs = new Map();
  let revision = 0;
  const filename = (time, key) => `${time}-${key}.png`;
  const files = new Set(await readdir(directory));
  function add(frame) {
    if (!Number.isSafeInteger(frame.time) || frame.time <= 0) return;
    if (!pairs.has(frame.time)) revision++;
    pairs.set(frame.time, {
      time: frame.time,
      url: `/frames/${filename(frame.time, viewKey)}`,
      overviewUrl: `/frames/${filename(frame.time, overviewKey)}`,
    });
  }
  for (const file of files) {
    const match = file.match(/^(\d+)-([a-f0-9]{12})\.png$/);
    if (match && match[2] === viewKey && files.has(filename(Number(match[1]), overviewKey))) add({ time: Number(match[1]) });
  }
  function cutoff() { return Math.floor(now() / 1000) - HISTORY_SECONDS - CLEANUP_BUFFER_SECONDS; }
  function prune() { for (const time of pairs.keys()) if (time < cutoff()) pairs.delete(time); }
  prune();
  function times() {
    const latest = Math.floor(now() / 1000);
    const earliestEnd = latest - HISTORY_SECONDS + WINDOW_SECONDS;
    return [...pairs.keys()].filter(time => time >= earliestEnd && time <= latest).sort((a, b) => a - b);
  }
  return {
    add, prune, cutoff, revision: () => revision,
    available: () => ({ times: times(), retentionDays: HISTORY_DAYS }),
    window(end, hours = 2) {
      if (![2, 4, 6].includes(hours)) return null;
      if (!Number.isSafeInteger(end) || !times().includes(end)) return null;
      const start = end - hours * 3600, slots = hours * 6 + 1;
      const frames = [...pairs.values()].filter(frame => frame.time >= start && frame.time <= end)
        .filter(frame => (end - frame.time) % 600 === 0)
        .sort((a, b) => a.time - b.time).slice(-slots);
      const complete = frames.length === slots && frames[0].time === start && frames.every((frame, i) => i === 0 || frame.time - frames[i - 1].time === 600);
      return { start, end, frames, complete };
    },
  };
}
