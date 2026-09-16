import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchive, HISTORY_SECONDS, CLEANUP_BUFFER_SECONDS, WINDOW_SECONDS } from '../src/archive.js';
import { createRadar } from '../src/radar.js';
const main = 'aaaaaaaaaaaa', overview = 'bbbbbbbbbbbb';
test('archive restores matching complete pairs, filters retention and preserves missing intervals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'radar-archive-'));
  let now = 2000000;
  const earliest = now - HISTORY_SECONDS;
  const pair = async time => Promise.all([main, overview].map(key => writeFile(join(directory, `${time}-${key}.png`), 'fixture')));
  try {
    for (const time of [earliest, earliest + WINDOW_SECONDS, now - 1200, now]) await pair(time);
    await writeFile(join(directory, `${now - 600}-${main}.png`), 'incomplete');
    await writeFile(join(directory, `${now - 600}-cccccccccccc.png`), 'other view');
    const archive = await createArchive(directory, main, overview, () => now * 1000);
    assert.deepEqual(archive.available().times, [earliest + WINDOW_SECONDS, now - 1200, now]);
    const result = archive.window(now);
    assert.equal(result.start, now - WINDOW_SECONDS);
    assert.deepEqual(result.frames.map(f => f.time), [now - 1200, now]);
    assert.equal(result.complete, false);
    assert.equal(archive.window(now - 600), null);
    assert.equal(archive.window(earliest), null);
    assert.equal(archive.window(NaN), null);
    assert.equal(archive.cutoff(), earliest - CLEANUP_BUFFER_SECONDS);
    now += HISTORY_SECONDS + CLEANUP_BUFFER_SECONDS + 1;
    archive.prune();
    assert.deepEqual(archive.available().times, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('complete windows are ordered and bounded while acquisition adds newer pairs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'radar-archive-'));
  try {
    const now = 2000000;
    const archive = await createArchive(directory, main, overview, () => now * 1000);
    for (let i = 0; i < 15; i++) archive.add({time: now - i * 600});
    const result = archive.window(now - 600);
    assert.equal(result.frames.length, 13);
    assert.equal(result.complete, true);
    archive.add({time: now + 600});
    assert.deepEqual(archive.window(now - 600), result);
    assert.equal(archive.window(now + 600), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('cleanup retains the extra hour and removes expired images even when provider is offline', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'radar-retention-'));
  const now = 2000000;
  const cutoff = now - HISTORY_SECONDS - CLEANUP_BUFFER_SECONDS;
  try {
    // Fill the pre-existing safety allowance, so old files are judged by retention.
    for(let i = 0; i < 28; i++) await writeFile(join(directory, `${now - i * 600}-${main}.png`), 'fixture');
    const expired = join(directory, `${cutoff - 1}-${main}.png`);
    const buffer = join(directory, `${cutoff + 1}-${main}.png`);
    await writeFile(expired, 'fixture'); await writeFile(buffer, 'fixture');
    const radar = await createRadar(directory, {getHistory: async () => { throw new Error('Offline'); }}, {now: () => now * 1000});
    await radar.refresh();
    await assert.rejects(access(expired));
    await access(buffer);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rolling archive windows are bounded to 13/25/37 slots with partial history and no new storage',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'radar-durations-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const end=2000000,archive=await createArchive(directory,main,overview,()=>end*1000);
  for(let i=0;i<50;i++) archive.add({time:end-i*600});
  for(const hours of [2,4,6]) {
    const window=archive.window(end,hours);
    assert.equal(window.frames.length,hours*6+1);assert.equal(window.start,end-hours*3600);assert.equal(window.complete,true);
  }
  for(const hours of [0,3,8,'6',NaN]) assert.equal(archive.window(end,hours),null);
  const revision=archive.revision();archive.add({time:end});assert.equal(archive.revision(),revision);
  const partial=archive.window(end-42*600,6);assert.equal(partial.complete,false);assert.equal(partial.frames.length,8);
});
