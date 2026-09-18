import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { hash } from './map.js';
import { HISTORY_SECONDS, CLEANUP_BUFFER_SECONDS, HISTORY_DAYS } from './archive.js';

const sources = ['rainviewer', 'rainbow'];
const roles = ['main', 'overview'];
const pathPattern = /^\/frames\/(\d+)-([a-f0-9]{12})\.png$/;
const resolve = s => ({ main: s.main, overview: s.overview === 'same' ? s.main : s.overview });
export const validArchiveHours = hours => Number.isInteger(hours) && hours >= 1 && hours <= 24;

// Additive index: old captures remain untouched for inspection and rollback.
export async function createObservationArchive(directory, views, { now = Date.now, selection } = {}) {
  const file = join(directory, `observations-${hash(views)}.json`);
  const keys = Object.fromEntries(roles.map(role => {
    const originalKey = role === 'main' ? views.viewKey : views.overviewKey;
    return [role, Object.fromEntries(sources.map(source => [source,
      source === 'rainviewer' ? originalKey : hash({ source, originalKey })]))];
  }));
  let records = new Map(), bindings = {}, transitions = [], revision = 0;
  let issues = [], issueCount = 0, writing = Promise.resolve();
  const cutoff = () => Math.floor(now() / 1000) - HISTORY_SECONDS - CLEANUP_BUFFER_SECONDS;
  const id = r => `${r.source}:${r.key}:${r.time}`;
  const validSelection = s => s && roles.every(role => sources.includes(s[role]));
  function valid(r) {
    const match = typeof r?.url === 'string' && r.url.match(pathPattern);
    return match && Number.isSafeInteger(r.time) && r.time > 0 && Number(match[1]) === r.time &&
      match[2] === r.key && sources.includes(r.source) && roles.some(role => keys[role][r.source] === r.key);
  }
  function issue(kind, name) {
    issueCount++;
    if (issues.length < 100) issues.push({ kind, file: name });
  }
  let restored = false;
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved.version !== 1 || !Array.isArray(saved.observations) || saved.observations.length > 20000 ||
        !saved.observations.every(valid) || !Array.isArray(saved.transitions) || !saved.transitions.length ||
        !saved.transitions.every((s, i) => Number.isSafeInteger(s.time) && s.time >= 0 && validSelection(s) &&
          (!i || s.time > saved.transitions[i - 1].time)) || !saved.bindings ||
        !Object.entries(saved.bindings).every(([time, b]) => /^\d+$/.test(time) &&
          Object.entries(b).every(([role, source]) => roles.includes(role) && sources.includes(source))))
      throw new Error('Invalid observation index');
    revision = Number.isSafeInteger(saved.revision) && saved.revision >= 0 ? saved.revision : 0;
    records = new Map(saved.observations.filter(r => r.time >= cutoff()).map(r => [id(r), r]));
    transitions = saved.transitions; bindings = saved.bindings;
    issues = (saved.migration?.issues ?? []).slice(0, 100); issueCount = saved.migration?.issueCount ?? issues.length;
    restored = true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error('Observation history is invalid. Restore the observation index; original captures are unchanged.');
  }
  const current = resolve(selection);
  if (!validSelection(current)) throw new Error('Invalid observation source selection');
  if (!transitions.length) transitions = [{ time: 0, ...current }];

  // Validate local files once on startup, not on each status request. Both sources
  // can have retained images even when only one is currently selected.
  const files = await readdir(directory), usable = new Set();
  for (const name of files) {
    const match = name.match(/^(\d+)-([a-f0-9]{12})\.png$/);
    if (!match || Number(match[1]) < cutoff()) continue;
    for (const source of sources) {
      const role = roles.find(role => keys[role][source] === match[2]);
      if (!role) continue;
      const r = { time: Number(match[1]), key: match[2], source, url: `/frames/${name}` };
      if (!valid(r)) continue;
      try {
        const target = role === 'main' ? views.view : views.overviewView;
        const image = sharp(await readFile(join(directory, name)));
        const info = await image.metadata();
        if (info.width !== target.width || info.height !== target.height) throw new Error();
        await image.stats();
        usable.add(id(r)); records.set(id(r), r);
      } catch { issue('unusable-image', name); }
    }
  }
  for (const [key] of records) if (!usable.has(key)) records.delete(key);
  if (!restored) {
    try {
      const captures = JSON.parse(await readFile(join(directory, `captured-${hash(views)}.json`), 'utf8'));
      if (!Array.isArray(captures) || captures.length > 1100) throw new Error();
      for (const f of captures) for (const role of roles) {
        const url = role === 'main' ? f.url : f.overviewUrl;
        if (!url) continue;
        const source = role === 'main' ? f.source : f.overviewSource;
        const time = role === 'main' ? f.mainTime : f.overviewTime;
        const match = typeof url === 'string' && url.match(pathPattern);
        const r = match && { time: Number(match[1]), key: match[2], source, url };
        if (!r || !valid(r) || r.key !== keys[role][source] || (time != null && time !== r.time)) {
          issue('inconsistent-capture', `captured-${hash(views)}.json`); continue;
        }
        if (!usable.has(id(r))) continue;
        // Bind real observation timestamps, never the later capture timestamp.
        const b = bindings[r.time] ??= {};
        if (b[role] && b[role] !== source) issue('ambiguous-source', `captured-${hash(views)}.json`);
        else b[role] = source;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') issue('unreadable-captures', `captured-${hash(views)}.json`);
    }
  }
  // On first conversion, a uniquely identified disk observation is useful even
  // if its provider is no longer selected. This does not invent switch times.
  if (!restored) {
    for (const r of records.values()) for (const role of roles) {
      if (r.key !== keys[role][r.source]) continue;
      const b = bindings[r.time] ??= {};
      if (b[role]) continue;
      const candidates = sources.filter(source => records.has(`${source}:${keys[role][source]}:${r.time}`));
      if (candidates.length === 1) b[role] = candidates[0];
      else {
        b[role] = current[role];
        issue('ambiguous-source', `observations-${hash(views)}.json`);
      }
    }
  }
  function prune() {
    for (const [key, r] of records) if (r.time < cutoff()) records.delete(key);
    for (const time of Object.keys(bindings)) if (Number(time) < cutoff()) delete bindings[time];
    // Retain the last transition before the boundary to interpret the first slot.
    while (transitions.length > 1 && transitions[1].time < cutoff()) transitions.shift();
  }
  async function persist() {
    prune();
    const body = JSON.stringify({ version: 1, revision: revision + 1, observations: [...records.values()], bindings, transitions,
      migration: { issueCount, issues } });
    await writeFile(file + '.tmp', body); await rename(file + '.tmp', file);
    revision++;
  }
  function transaction(change) {
    const task = writing.then(async () => {
      const before = { records: new Map(records), bindings: structuredClone(bindings), transitions: [...transitions] };
      try { if (change()) await persist(); }
      catch (e) { ({ records, bindings, transitions } = before); throw e; }
    });
    writing = task.catch(() => {}); return task;
  }
  function expected(time, role) {
    return bindings[time]?.[role] ?? transitions.findLast(s => s.time <= time)?.[role] ?? transitions[0][role];
  }
  function frames(start, end) {
    const byTime = new Map();
    for (const r of records.values()) {
      if (r.time < start || r.time > end || r.time < now() / 1000 - HISTORY_SECONDS) continue;
      for (const role of roles) {
        if (r.key !== keys[role][r.source] || expected(r.time, role) !== r.source) continue;
        const f = byTime.get(r.time) ?? { time: r.time, url: null, overviewUrl: null,
          source: null, overviewSource: null, mainTime: null, overviewTime: null,
          expectedSources: Object.fromEntries(roles.map(role => [role, expected(r.time, role)])) };
        if (role === 'main') { f.url = r.url; f.source = r.source; f.mainTime = r.time; }
        else { f.overviewUrl = r.url; f.overviewSource = r.source; f.overviewTime = r.time; }
        byTime.set(r.time, f);
      }
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }
  function window(start, end) {
    const selected = frames(start, end), byTime = new Map(selected.map(f => [f.time, f]));
    // Coverage uses the regular ten-minute clock plus exact off-grid observations.
    // Empty coverage slots are metadata only, never synthetic playable frames.
    const times = new Set(selected.map(f => f.time));
    for (let t = Math.ceil(start / 600) * 600; t <= end; t += 600) times.add(t);
    const coverage = [...times].sort((a, b) => a - b).map(time => ({ time,
      main: !!byTime.get(time)?.url, overview: !!byTime.get(time)?.overviewUrl,
      sources: Object.fromEntries(roles.map(role => [role, expected(time, role)])) }));
    const counts = Object.fromEntries(roles.map(role => [role, {
      available: coverage.filter(f => f[role]).length, missing: coverage.filter(f => !f[role]).length,
    }]));
    return { start, end, frames: selected, coverage, counts, playable: selected.length,
      complete: coverage.length > 0 && coverage.every(f => f.main && f.overview) };
  }
  async function select(s) {
    const next = resolve(s);
    if (!validSelection(next)) throw new Error('Invalid observation source selection');
    return transaction(() => {
      if (roles.every(role => transitions.at(-1)[role] === next[role])) return false;
      const time = Math.floor(now() / 1000);
      if (time < transitions.at(-1).time) throw new Error('Source change clock moved backwards');
      // Existing slots keep their source, including the missing half of a pair.
      for (const f of frames(cutoff(), time)) bindings[f.time] = { ...f.expectedSources };
      if (time === transitions.at(-1).time) transitions.pop();
      transitions.push({ time, ...next }); return true;
    });
  }
  await persist();
  await select(current);
  return {
    revision: () => revision, cutoff,
    migration: () => ({ issueCount, issues: structuredClone(issues) }),
    select,
    add(observations) {
      return transaction(() => {
        let changed = false;
        for (const r of observations) {
          if (!valid(r) || r.time < cutoff()) continue;
          if (!records.has(id(r))) { records.set(id(r), { time: r.time, key: r.key, source: r.source, url: r.url }); changed = true; }
        }
        if ([...records.values()].some(r => r.time < cutoff())) changed = true;
        return changed;
      });
    },
    frames: () => frames(now() / 1000 - HISTORY_SECONDS, Math.floor(now() / 1000)),
    available: () => ({ times: frames(now() / 1000 - HISTORY_SECONDS, Math.floor(now() / 1000)).map(f => f.time), retentionDays: HISTORY_DAYS }),
    window(end, hours = 2) {
      if (!validArchiveHours(hours) || !Number.isSafeInteger(end) || !frames(end, end).length || end > now() / 1000) return null;
      return window(end - hours * 3600, end);
    },
    live(hours = 2) {
      if (![2, 4, 6].includes(hours)) return null;
      const clock = Math.floor(now() / 1000), gridEnd = Math.floor(clock / 600) * 600;
      // Do not hide an already acquired off-grid observation until the next tick.
      const end = Math.max(gridEnd, frames(gridEnd, clock).at(-1)?.time ?? gridEnd);
      const start=end-hours*3600;
      return { ...window(start, end), borrowFrames: frames(start-1800, start-1), serverTime: now(), cadenceSeconds: 600 };
    },
  };
}
