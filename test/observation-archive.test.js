import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { createObservationArchive } from '../src/observation-archive.js';
import { createCapturedArchive, cleanupCaptured } from '../src/captured-archive.js';
import {createHistoryStore} from '../src/history-store.js';
import { createRadarSources } from '../src/radar-sources.js';
import { hash } from '../src/map.js';
import { HISTORY_SECONDS } from '../src/archive.js';
const end = Date.UTC(2026, 8, 18, 12) / 1000;
const views = { view: { lat: 0, lon: 0, zoom: 0, radarZoom: 0, width: 32, height: 32 }, viewKey: '111111111111',
  overviewView: { lat: 0, lon: 0, zoom: 1, radarZoom: 1, width: 32, height: 32 }, overviewKey: '222222222222' };
const selection = { main: 'rainviewer', overview: 'rainbow' };
const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#abc' } }).png().toBuffer();
const tile = await sharp({ create: { width: 256, height: 256, channels: 4, background: '#abc' } }).png().toBuffer();
const key = (role, source) => source === 'rainviewer' ? (role === 'main' ? views.viewKey : views.overviewKey) :
  hash({ source, originalKey: role === 'main' ? views.viewKey : views.overviewKey });
const record = (time, role, source = selection[role]) => ({ time, source, key: key(role, source), url: `/frames/${time}-${key(role, source)}.png` });
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'radar-observations-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function images(dir, records) { for (const r of records) await writeFile(join(dir, r.url.slice(8)), png); }
const open = (dir, options = {}) => createObservationArchive(dir, views, { now: () => end * 1000, selection, ...options });

test('restart reuses byte-validated images but detects replaced, damaged and removed files',async t=>{
  const dir=await fixture(t),r=record(end,'main'),path=join(dir,r.url.slice(8));
  await images(dir,[r]);
  let decodes=0;const raw=sharp.prototype.raw;
  t.mock.method(sharp.prototype,'raw',function(...args){decodes++;return raw.apply(this,args);});
  assert.equal((await open(dir)).frames().length,1);assert.equal(decodes,1);
  assert.equal((await open(dir)).frames().length,1);assert.equal(decodes,1);
  const replacement=await sharp({create:{width:32,height:32,channels:4,background:'#def'}}).png().toBuffer();
  await writeFile(path,replacement);
  assert.equal((await open(dir)).frames().length,1);assert.equal(decodes,2);
  const broken=Buffer.from(replacement);broken.fill(0,45,Math.min(65,broken.length));
  await writeFile(path,broken);
  assert.equal((await open(dir)).frames().length,0);
  await writeFile(path,png);assert.equal((await open(dir)).frames().length,1);
  await rm(path);assert.equal((await open(dir)).frames().length,0);
});

test('older indexes without validation fingerprints are revalidated once',async t=>{
  const dir=await fixture(t);await images(dir,[record(end,'main')]);await open(dir);
  const path=join(dir,`observations-${hash(views)}.json`),saved=JSON.parse(await readFile(path,'utf8'));
  delete saved.observations[0].validation;await writeFile(path,JSON.stringify(saved));
  await open(dir);
  const next=JSON.parse(await readFile(path,'utf8'));
  assert.match(next.observations[0].validation.sha256,/^[a-f0-9]{64}$/);
});

test('migration uses real times, imports independent disk history, preserves old bytes and restarts idempotently', async t => {
  const dir = await fixture(t);
  const observations = [record(end - 600, 'main'), record(end, 'overview'), record(end - 3600, 'overview')];
  await images(dir, observations);
  const legacyFile = join(dir, `captured-${hash(views)}.json`);
  const legacy = JSON.stringify([{ time: end, url: observations[0].url, overviewUrl: observations[1].url,
    source: 'rainviewer', overviewSource: 'rainbow', mainTime: end - 600, overviewTime: end }]);
  await writeFile(legacyFile, legacy);
  const a = await open(dir), window = a.window(end, 1);
  assert.deepEqual(window.frames.map(f => f.time), [end - 3600, end - 600, end]);
  assert.equal(window.frames.at(-1).url, null);
  assert.equal(window.frames.at(-2).overviewUrl, null);
  assert.equal(window.playable, 3); assert.equal(window.complete, false);
  assert.equal(a.migration().issueCount, 0);
  assert.equal(await readFile(legacyFile, 'utf8'), legacy);
  assert.deepEqual((await open(dir)).window(end, 1), window);
  // Code rollback can still read the original capture index; no conversion overwrote it.
  const old = await createCapturedArchive(dir, hash(views), { now: () => end * 1000 });
  assert.equal(old.frames().length, 1); assert.equal(old.frames()[0].url, observations[0].url);
});

test('inconsistent legacy times and corrupt images are diagnosed without inventing coverage or deleting evidence', async t => {
  const dir = await fixture(t), r = record(end, 'main');
  await images(dir, [r]);
  const corrupt = record(end, 'overview'); await writeFile(join(dir, corrupt.url.slice(8)), 'broken');
  const file = join(dir, `captured-${hash(views)}.json`);
  await writeFile(file, JSON.stringify([{ time: end, url: r.url, mainTime: end + 600, source: 'rainviewer' }]));
  const a = await open(dir);
  assert.equal(a.frames()[0].time, end); // Proven filename/image, never the conflicting claimed time.
  assert.equal(a.frames()[0].overviewUrl, null);
  assert.equal(a.migration().issueCount, 2);
  await access(file); await access(join(dir, corrupt.url.slice(8)));
});

test('all integer Archive windows 1–24 are local, inclusive, and available at retention edges', async t => {
  const dir = await fixture(t), a = await open(dir);
  const records = [];
  for (let i = 0; i <= 144; i++) for (const role of ['main', 'overview']) records.push(record(end - i * 600, role));
  await a.add(records);
  for (const hours of [1, 2, 3, 6, 24]) {
    const w = a.window(end, hours);
    assert.equal(w.frames.length, hours * 6 + 1); assert.equal(w.complete, true);
    assert.equal(w.counts.main.missing, 0);
  }
  for (const hours of [0, 25, 1.5, '2', NaN]) assert.equal(a.window(end, hours), null);
  await a.add([record(end - HISTORY_SECONDS, 'main')]);
  assert.ok(a.available().times.includes(end - HISTORY_SECONDS));
  assert.equal(a.window(end - HISTORY_SECONDS, 24).frames.length, 1);
  assert.equal(a.window(end + 600), null);
});

test('off-grid observations survive exactly; partial totals are incomplete, and time advances through zero/one/two positions', async t => {
  const dir = await fixture(t); let clock = end * 1000;
  const a = await open(dir, { now: () => clock });
  await a.add([record(end - 300, 'main'), record(end, 'overview')]);
  assert.deepEqual(a.live().frames.map(f => f.time), [end - 300, end]);
  assert.equal(a.live().playable, 2); assert.equal(a.live().complete, false);
  clock += 7800000; assert.equal(a.live().playable, 1);
  clock += 600000; assert.equal(a.live().playable, 0);
  assert.equal(a.live().coverage.length, 13);
  assert.ok(a.live().coverage.every(f => !f.main && !f.overview));
  assert.equal(a.live(1), null); assert.equal(a.live(24), null);
});

test('Live grace delays the endpoint but reports early partial gaps immediately', async t => {
  const dir=await fixture(t);let clock=end*1000;
  const a=await open(dir,{now:()=>clock});
  await a.add(Array.from({length:14},(_,i)=>['main','overview'].map(role=>record(end-(i+1)*600,role))).flat());
  assert.equal(a.live().end,end-600);
  assert.equal(a.live().complete,true);
  assert.equal(a.live().frames.length,13);
  await a.add([record(end,'main')]);
  let live=a.live();
  assert.equal(live.end,end);assert.equal(live.start,end-7200);
  assert.equal(live.frames.at(-1).overviewUrl,null);
  assert.equal(live.coverage.at(-1).pending,false);
  assert.equal(live.counts.overview.missing,1);assert.equal(live.complete,false);
  assert.equal(a.window(end).counts.overview.missing,1);
  assert.equal(a.window(end).complete,false);
  clock+=599999;assert.equal(a.live().complete,false);
  clock+=1;live=a.live();
  assert.equal(live.end,end);assert.equal(live.coverage.at(-1).pending,false);
  assert.equal(live.counts.overview.missing,1);assert.equal(live.complete,false);
  await a.add([record(end,'overview')]);
  assert.equal(a.live().complete,true);assert.equal(a.window(end).complete,true);
  clock+=600000;live=a.live();
  assert.equal(live.end,end+600);assert.equal(live.counts.main.missing,1);
  assert.equal(live.counts.overview.missing,1);assert.equal(live.complete,false);
});

test('late addition patches missing half without duplicates and source transitions preserve existing slots', async t => {
  const dir = await fixture(t); let clock = end * 1000;
  const a = await open(dir, { now: () => clock });
  await a.add([record(end, 'main')]);
  const revision = a.revision(); await a.add([record(end, 'main')]); assert.equal(a.revision(), revision);
  await a.select({ main: 'rainbow', overview: 'rainviewer' });
  await a.add([record(end, 'overview'), record(end, 'main', 'rainbow'), record(end, 'overview', 'rainviewer')]);
  const old = a.window(end).frames.at(-1);
  assert.equal(old.source, 'rainviewer'); assert.equal(old.overviewSource, 'rainbow');
  clock += 600000;
  await a.add([record(end + 600, 'main', 'rainbow')]);
  const next = a.live().frames.at(-1);
  assert.equal(next.source, 'rainbow'); assert.equal(next.overviewUrl, null);
  assert.deepEqual(next.expectedSources, { main: 'rainbow', overview: 'rainviewer' });
});

test('failed atomic publication preserves the previous readable index and in-memory state', async t => {
  const dir = await fixture(t), a = await open(dir), path = join(dir, `observations-${hash(views)}.json`);
  const before = await readFile(path, 'utf8');
  await mkdir(path + '.tmp');
  await assert.rejects(a.add([record(end, 'main')]));
  assert.equal(a.frames().length, 0); assert.equal(await readFile(path, 'utf8'), before);
  await rm(path + '.tmp', { recursive: true });
  await a.add([record(end, 'main')]); assert.equal(a.frames().length, 1);
});

test('cleanup preserves original capture evidence and active observation references but removes expired unreferenced images', async t => {
  const dir = await fixture(t), old = record(end - HISTORY_SECONDS - 7200, 'main');
  await images(dir, [old]);
  const legacy = join(dir, `captured-${hash(views)}.json`);
  await writeFile(legacy, JSON.stringify([{ time: old.time, url: old.url, overviewUrl: null, source: old.source, overviewSource: null }]));
  const unused = record(old.time, 'overview'); await images(dir, [unused]);
  const fresh = record(end, 'overview'); await images(dir, [fresh]);
  await open(dir); await cleanupCaptured(dir, () => end * 1000);
  await access(join(dir, old.url.slice(8))); await access(join(dir, fresh.url.slice(8)));
  await assert.rejects(access(join(dir, unused.url.slice(8))), { code: 'ENOENT' });
});

test('late provider recovery fills original gaps; status ages on outage; 24-hour reads add no upstream calls', async t => {
  const dir = await mkdtemp(join(tmpdir(),'radar-sqlite-observations-')); let clock = end * 1000, failure = true, checks = 0, calls = 0;
  const provider = source => ({
    getHistory: async () => { checks++; return [{ time: end - 600 }, { time: end }]; },
    getTile: async frame => { calls++; if (source === 'rainbow' && failure && frame.time === end - 600) throw Error('synthetic missing'); return tile; },
  });
  const store=await createHistoryStore(dir,{now:clock+86400000});t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  const a = await createRadarSources(dir, { rainviewer: provider('rainviewer'), rainbow: provider('rainbow') }, {
    store, views, now: () => clock, waitForSettle: () => false, selection: () => selection, nextRefreshAt: () => clock + 123000,
  });
  await a.refresh();
  assert.equal((await a.archive.window(end)).frames[0].overviewUrl, null);
  assert.equal(a.status().sources.main.nextCheckAt, clock + 123000);
  assert.equal(a.status().sources.main.checkedAt, new Date(clock).toISOString());
  failure = false; clock += 300000; await a.refresh();
  assert.ok((await a.archive.window(end)).frames[0].overviewUrl);
  assert.equal((await a.archive.window(end)).frames.length, 2);
  const before = { checks, calls };
  for (let i = 0; i < 10; i++) await a.archive.window(end, 24);
  assert.deepEqual({ checks, calls }, before);
  clock += 8 * 3600000; assert.equal(a.status(6).frames.length, 0);
  assert.equal(a.status().frame, null);
});

test('recent off-grid acquisition appears immediately rather than waiting for a grid tick', async t => {
  const dir = await fixture(t), a = await open(dir, { now: () => (end + 350) * 1000 });
  await a.add([record(end + 300, 'main')]);
  assert.equal(a.live().frames.at(-1).time, end + 300);
  assert.equal(a.live().end, end + 300);
});

test('restart preserves source transitions, index revision and geometry isolation', async t => {
  const dir = await fixture(t); let clock = end * 1000;
  let a = await open(dir, { now: () => clock });
  const old = record(end, 'main'); await images(dir, [old]); await a.add([old]);
  clock += 600000;
  const selected = { main: 'rainbow', overview: 'rainviewer' };
  await a.select(selected);
  const fresh = record(end + 600, 'main', 'rainbow'); await images(dir, [fresh]); await a.add([fresh]);
  const revision = a.revision(), before = a.live();
  a = await open(dir, { now: () => clock, selection: selected });
  assert.deepEqual(a.live(), before); assert.ok(a.revision() > revision);
  const otherViews = { ...views, viewKey: '333333333333', overviewKey: '444444444444' };
  const other = await createObservationArchive(dir, otherViews, { now: () => clock, selection });
  assert.deepEqual(other.available().times, []);
});

test('a corrupt new index stops safely instead of overwriting either history format', async t => {
  const dir = await fixture(t), path = join(dir, `observations-${hash(views)}.json`);
  const bad = '{"version":99}'; await writeFile(path, bad);
  await assert.rejects(open(dir), /Observation history is invalid/);
  assert.equal(await readFile(path, 'utf8'), bad);
});

test('migration retains uniquely proven observations from providers no longer selected', async t => {
  const dir = await fixture(t), old = record(end - 600, 'main', 'rainbow');
  await images(dir, [old]);
  const a = await open(dir);
  assert.equal(a.frames()[0].source, 'rainbow');
  assert.equal(a.frames()[0].time, end - 600);
});


test('incident evidence records early gaps, exact grace and late recovery once without viewers',async t=>{
  const dir=await fixture(t);let clock=end*1000+180000;
  const a=await open(dir,{now:()=>clock});
  const slot=end+600,main=record(slot,'main'),overview=record(slot,'overview');
  clock=(slot+360)*1000;
  await images(dir,[main]);await a.add([{...main,arrivedAt:clock}]);
  assert.equal(a.live().counts.overview.gapsSeen,1);
  assert.equal(a.live().counts.main.lateArrivals,0);
  clock=(slot+600)*1000;
  await images(dir,[overview]);await a.add([{...overview,arrivedAt:clock}]);
  assert.equal(a.live().counts.overview.lateArrivals,0);
  assert.equal(a.live().counts.overview.gapsSeen,1);
  const late=record(slot+600,'main');clock=(slot+1200)*1000+1;
  await a.observe();await images(dir,[late]);await a.add([{...late,arrivedAt:clock}]);
  await Promise.all(Array.from({length:8},()=>a.add([{...late,arrivedAt:clock+1}])));
  assert.equal(a.live().counts.main.lateArrivals,1);
  assert.equal(a.live().counts.main.gapsSeen,1);
  assert.equal(a.live().counts.overview.gapsSeen,2);
  assert.equal(a.window(slot+600,1).counts.main.lateArrivals,1);
  const restarted=await open(dir,{now:()=>clock});
  assert.deepEqual(restarted.live().counts,a.live().counts);
  clock+=8*3600000;await restarted.observe();
  assert.equal(restarted.live().counts.main.lateArrivals,0);
});

test('startup backfill and downtime are unknown, known gaps survive restart and late recovery',async t=>{
  const dir=await fixture(t);let clock=end*1000;
  let a=await open(dir,{now:()=>clock});
  const old=record(end-600,'main');await images(dir,[old]);await a.add([{...old,arrivedAt:clock}]);
  assert.equal(a.live().counts.main.tracked,0);
  clock=(end+1200)*1000;await a.observe();
  assert.equal(a.live().counts.main.gapsSeen,1);
  clock=(end+3600)*1000;a=await open(dir,{now:()=>clock});await a.observe();
  assert.equal(a.live().counts.main.gapsSeen,1);
  const recovered=record(end+600,'main');await images(dir,[recovered]);await a.add([{...recovered,arrivedAt:clock}]);
  assert.equal(a.live().counts.main.lateArrivals,1);
  assert.ok(a.live().counts.main.tracked<a.live().counts.main.total);
  clock+=9*86400000;await a.observe();
  const saved=JSON.parse(await readFile(join(dir,`observations-${hash(views)}.json`),'utf8'));
  assert.ok(saved.incidents.every(r=>r.time>=a.cutoff()));
  assert.ok(saved.incidents.length<=74);
});

test('incident publication rolls back atomically and source switches do not invent backfill incidents',async t=>{
  const dir=await fixture(t);let clock=end*1000;
  const a=await open(dir,{now:()=>clock}),file=join(dir,`observations-${hash(views)}.json`);
  const before=await readFile(file,'utf8');
  clock=(end+1200)*1000;await mkdir(file+'.tmp');
  await assert.rejects(a.observe());assert.equal(a.live().counts.main.gapsSeen,0);
  assert.equal(await readFile(file,'utf8'),before);await rm(file+'.tmp',{recursive:true});
  await a.observe();assert.equal(a.live().counts.main.gapsSeen,1);
  clock+=180000;await a.select({main:'rainbow',overview:'rainbow'});
  const old=record(end+600,'main','rainbow');await images(dir,[old]);await a.add([{...old,arrivedAt:clock}]);
  assert.equal(a.live().counts.main.lateArrivals,0);
  clock=(end+2400)*1000;await a.observe();
  const state=JSON.parse(await readFile(file,'utf8'));
  assert.ok(state.incidents.some(r=>r.source==='rainbow'&&r.key===key('main','rainbow')));
  assert.ok(state.incidents.some(r=>r.source==='rainviewer'&&r.key===key('main','rainviewer')));
});


test('recovery between clock ticks cannot erase a due gap',async t=>{
  const dir=await fixture(t);let clock=end*1000;
  const a=await open(dir,{now:()=>clock}),r=record(end+600,'main');
  clock=(end+1200)*1000+1;await images(dir,[r]);await a.add([{...r,arrivedAt:clock}]);
  assert.equal(a.live().counts.main.gapsSeen,1);
  assert.equal(a.live().counts.main.lateArrivals,1);
});


test('first arrival at exact grace boundary creates neither a gap nor lateness',async t=>{
  const dir=await fixture(t);let clock=end*1000;
  const a=await open(dir,{now:()=>clock}),r=record(end+600,'main');
  clock=(end+1200)*1000;await images(dir,[r]);await a.add([{...r,arrivedAt:clock}]);
  assert.equal(a.live().counts.main.gapsSeen,0);
  assert.equal(a.live().counts.main.lateArrivals,0);
  assert.equal(a.live().counts.overview.gapsSeen,1);
});
