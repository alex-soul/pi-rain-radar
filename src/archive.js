import { readdir } from 'node:fs/promises';

export const HISTORY_DAYS = 7;
export const HISTORY_SECONDS = HISTORY_DAYS * 86400;
export const CLEANUP_BUFFER_SECONDS = 3600;
export const WINDOW_SECONDS = 7200;

// The PNG filenames are the durable index. Read them once on startup, then update
// this small in-memory index when complete pairs are acquired or cleaned up.
export async function createArchive(directory, viewKey, overviewKey, now = Date.now) {
  const pairs = new Map();
  const filename = (time, key) => `${time}-${key}.png`;
  const files = new Set(await readdir(directory));
  function add(frame) {
    if (!Number.isSafeInteger(frame.time) || frame.time <= 0) return;
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
    add, prune, cutoff,
    available: () => ({ times: times(), retentionDays: HISTORY_DAYS }),
    window(end) {
      if (!Number.isSafeInteger(end) || !times().includes(end)) return null;
      const start = end - WINDOW_SECONDS;
      const frames = [...pairs.values()].filter(frame => frame.time >= start && frame.time <= end)
        .sort((a, b) => a.time - b.time).slice(-13);
      const complete = frames.length === 13 && frames[0].time === start && frames.every((frame, i) => i === 0 || frame.time - frames[i - 1].time === 600);
      return { start, end, frames, complete };
    },
  };
}
