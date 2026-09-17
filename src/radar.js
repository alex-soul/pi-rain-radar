import sharp from "sharp";
import { createArchive } from "./archive.js";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { defaultViews, radarTiles } from "./map.js";
import { getHistory, getTile } from "./provider.js";

export async function createRadar(
  directory,
  provider = { getHistory, getTile },
  { now = Date.now, settleMs = 300000, waitForSettle = () => true, onEvent = () => {}, nextRefreshAt = () => now() + 300000, views = defaultViews, storageKey = '', manageCleanup = true } = {},
) {
  const {view, viewKey, overviewView, overviewKey} = views;
  const historyFile = storageKey ? `history-${storageKey}.json` : 'history.json';
  const settlingFile = storageKey ? `settling-${storageKey}.json` : 'settling.json';
  await mkdir(directory, { recursive: true });
  const archive = await createArchive(directory, viewKey, overviewKey, now);
  let frames = [],
    error = null,
    checkedAt = null,
    busy = false,
    progress = null;
  const filename = (time, key = viewKey) => `${time}-${key}.png`;
  async function cachedImage(time, target, key) {
    if (!Number.isSafeInteger(time) || time <= 0)
      throw new Error("Invalid cached time");
    const file = filename(time, key);
    const data = await readFile(join(directory, file));
    const info = await sharp(data).metadata();
    if (info.width !== target.width || info.height !== target.height)
      throw new Error("Wrong cache dimensions");
    await sharp(data).stats();
    return file;
  }
  async function cached(time) {
    const file = await cachedImage(time, view, viewKey);
    const overviewFile = await cachedImage(time, overviewView, overviewKey);
    return { time, file, viewKey, overviewFile, overviewKey };
  }
  try {
    let saved;
    try {
      saved = JSON.parse(
        await readFile(join(directory, historyFile), "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      const single = JSON.parse(
        await readFile(join(directory, "current.json"), "utf8"),
      );
      saved = { viewKey: single.viewKey, frames: [single] };
    }
    if (
      saved.viewKey !== viewKey ||
      !Array.isArray(saved.frames) ||
      saved.frames.length > 13
    )
      throw new Error("Invalid cached sequence");
    for (const frame of saved.frames) {
      try {
        frames.push(await cached(frame.time));
      } catch {
        error = "Some cached radar frames are unavailable";
      }
    }
    frames = [
      ...new Map(frames.map((frame) => [frame.time, frame])).values(),
    ].sort((a, b) => a.time - b.time);
  } catch (e) {
    if (e.code !== "ENOENT") error = "Cached radar unavailable";
  }

  async function composeImage(frame, view, key) {
    try { return await cachedImage(frame.time, view, key); } catch { /* Compose missing view only. */ }
    const overlays = [];
    for (const tile of radarTiles(view)) {
      const input = await provider.getTile(frame, tile);
      const info = await sharp(input).metadata();
      if (info.width !== 256 || info.height !== 256)
        throw new Error("Unexpected tile dimensions");
      const left = Math.max(0, tile.left),
        top = Math.max(0, tile.top);
      const width = Math.min(view.width, tile.left + tile.size) - left;
      const height = Math.min(view.height, tile.top + tile.tileHeight) - top;
      const cropped = await sharp(input)
        .resize(tile.size, tile.tileHeight)
        .extract({ left: left - tile.left, top: top - tile.top, width, height })
        .png()
        .toBuffer();
      overlays.push({ input: cropped, left, top });
    }
    const result = await sharp({
      create: {
        width: view.width,
        height: view.height,
        channels: 4,
        background: "#00000000",
      },
    })
      .composite(overlays)
      .png()
      .toBuffer();
    const next = { time: frame.time, file: filename(frame.time, key), viewKey: key };
    await writeFile(join(directory, `${next.file}.tmp`), result);
    await rename(
      join(directory, `${next.file}.tmp`),
      join(directory, next.file),
    );
    return next.file;
  }
  async function compose(frame) {
    const file = await composeImage(frame, view, viewKey);
    const overviewFile = await composeImage(frame, overviewView, overviewKey);
    return { time: frame.time, file, viewKey, overviewFile, overviewKey };
  }
  // Persist only the bounded first-seen times, not another image cache.
  let firstSeen = new Map();
  try {
    const saved = JSON.parse(await readFile(join(directory, settlingFile), "utf8"));
    if (Array.isArray(saved)) firstSeen = new Map(saved.filter(entry =>
      Array.isArray(entry) && Number.isSafeInteger(entry[0]) && entry[0] > 0 &&
      Number.isFinite(entry[1]) && entry[1] >= 0 && entry[1] <= now()
    ).slice(-13));
  } catch { /* Missing or invalid state safely starts a fresh waiting period. */ }
  let connectionStarted = false, connectionReady = false, lastFailed = false;
  async function refresh(startedAt = now()) {
    if (busy) return;
    // Snapshot before any await: a settings change affects the next acquisition only.
    const delay = waitForSettle() ? settleMs : 0;
    if (!connectionStarted) { onEvent('radar-start'); connectionStarted = true; }
    busy = true;
    let incomplete = false;
    let previous = [];
    try {
      const available = await provider.getHistory();
      if (
        !Array.isArray(available) ||
        !available.length ||
        available.length > 13
      )
        throw new Error("No usable radar history");
      checkedAt = new Date().toISOString();
      if (frames.length && available.at(-1).time < frames.at(-1).time)
        throw new Error("Provider history is older than cached history");
      const observedAt = now();
      const known = new Set(frames.map(frame => frame.time));
      const listed = new Set(available.map(frame => frame.time));
      firstSeen = new Map([...firstSeen].filter(([time]) => listed.has(time) && !known.has(time)));
      const newest = available.at(-1).time;
      const recovering = !frames.length || newest - frames.at(-1).time >= 1800;
      for (const frame of available) {
        if (!known.has(frame.time)) {
          // Old history is already settled when bootstrapping or catching up.
          if (recovering && frame.time < newest) firstSeen.set(frame.time, startedAt - settleMs);
          else if (!firstSeen.has(frame.time)) firstSeen.set(frame.time, startedAt);
          if(Number.isFinite(frame.firstSeenAt)&&frame.firstSeenAt<=observedAt)
            firstSeen.set(frame.time,Math.min(firstSeen.get(frame.time),frame.firstSeenAt));
        }
      }
      await writeFile(join(directory, `${settlingFile}.tmp`), JSON.stringify([...firstSeen]));
      await rename(join(directory, `${settlingFile}.tmp`), join(directory, settlingFile));
      const eligible = available.filter(frame => known.has(frame.time) || observedAt - firstSeen.get(frame.time) >= delay);
      const currentLatest = frames.at(-1)?.time ?? 0;
      if (!eligible.some(frame => !known.has(frame.time) && frame.time >= currentLatest - 7200)) {
        error = null;
        return;
      }
      // Keep last-good history until we know which newer observations are complete.
      const latest = Math.max(currentLatest, eligible.at(-1)?.time ?? 0);
      const selected = [...new Map([...frames, ...eligible].map(frame => [frame.time, frame])).values()]
        .filter(frame => known.has(frame.time) || frame.time >= latest - 7200)
        .sort((a, b) => a.time - b.time);
      const next = [];
      progress = { completed: 0, total: selected.length };
      for (const frame of selected) {
        try {
          let local;
          try { local = await cached(frame.time); }
          catch { local = await compose(frame); }
          archive.add(local);
          next.push(local);
        } catch (e) {
          incomplete = true;
          // A missing main/overview pair must not block later complete timestamps.
          console.error(JSON.stringify({ event: "frame-unavailable", time: frame.time, message: e.message }));
        }
        progress = { completed: progress.completed + 1, total: selected.length };
      }
      if (!next.length) throw new Error("No complete radar frames available");
      const publishedLatest = next.at(-1).time;
      const published = next.filter(frame => frame.time >= publishedLatest - 7200).slice(-13);
      await writeFile(
        join(directory, `${historyFile}.tmp`),
        JSON.stringify({ viewKey, frames: published }),
      );
      await rename(
        join(directory, `${historyFile}.tmp`),
        join(directory, historyFile),
      );
      previous = frames;
      frames = published;
      error = incomplete || publishedLatest < latest ? "New radar data temporarily unavailable" : null;
      console.log(
        JSON.stringify({
          event: "history-published",
          frames: frames.length,
          latest: frames.at(-1).time,
        }),
      );
    } catch (e) {
      error = "New radar data temporarily unavailable";
      console.error(
        JSON.stringify({ event: "refresh-failed", message: e.message }),
      );
    } finally {
      if (error || incomplete) onEvent('radar-error');
      else if (lastFailed) onEvent('radar-recovered');
      else if (!connectionReady) onEvent('radar-ready');
      lastFailed = !!error || incomplete;
      if (!lastFailed) connectionReady = true;
      try {
        if (manageCleanup) {
        // Bound partial progress even during repeated failures, retaining last-good history.
        const all = await readdir(directory);
        const files = all
          .filter((file) => /^\d+(?:-[a-f0-9]{12})?\.png$/.test(file))
          .sort((a, b) => parseInt(b) - parseInt(a));
        const keep = new Set(
          [...frames, ...previous]
            .flatMap((frame) => [frame.file, frame.overviewFile])
            .concat(files.slice(0, 26)),
        );
        for (const file of files)
          if (!keep.has(file) && parseInt(file) < archive.cutoff()) await unlink(join(directory, file));
        archive.prune();
        for (const file of all)
          if (
            file.endsWith(".tmp") &&
            Date.now() - (await stat(join(directory, file))).mtimeMs > 3600000
          )
            await unlink(join(directory, file));
        }
      } catch (e) {
        console.error(
          JSON.stringify({ event: "cache-cleanup-failed", message: e.message }),
        );
      }
      busy = false;
      progress = null;
    }
  }
  function nextUpdate() {
    if (busy && progress) return { state: "fetching" };
    const pending = [...firstSeen].filter(([time]) => time > (frames.at(-1)?.time ?? 0));
    if (!pending.length || error) return null;
    const eligibleAt = Math.min(...pending.map(([, seen]) => seen + (waitForSettle() ? settleMs : 0)));
    const pollAt = nextRefreshAt();
    const expectedAt = pollAt + Math.max(0, Math.ceil((eligibleAt - pollAt) / 300000)) * 300000;
    return { state: "waiting", expectedAt };
  }
  return {
    refresh,
    archive,
    status: () => ({
      frames: frames.map((frame) => ({
        ...frame,
        url: `/frames/${frame.file}`,
        overviewUrl: `/frames/${frame.overviewFile}`,
      })),
      frame: frames.length
        ? { ...frames.at(-1), url: `/frames/${frames.at(-1).file}`, overviewUrl: `/frames/${frames.at(-1).overviewFile}` }
        : null,
      error,
      checkedAt,
      nextUpdate: nextUpdate(),
      fetching: busy,
      progress,
      view,
    }),
  };
}
