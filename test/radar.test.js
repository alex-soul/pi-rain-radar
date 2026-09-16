import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { world, project, radarTiles, view, overviewView } from "../src/map.js";
import { latestObservation, pastObservations } from "../src/provider.js";
import { createRadar } from "../src/radar.js";

test("Mercator landmarks and tile positions agree with the display centre", () => {
  assert.deepEqual(world(0, 0, 0), [128, 128]);
  assert.deepEqual(project(view.lon, view.lat), [640, 360]);
  const tiles = radarTiles();
  assert.ok(tiles.length <= 24);
  for (const [px, py] of [
    [0, 0],
    [1279, 0],
    [0, 719],
    [1279, 719],
    [640, 360],
  ]) {
    assert.equal(
      tiles.filter(
        (t) =>
          px >= t.left &&
          px < t.left + t.size &&
          py >= t.top &&
          py < t.top + t.size,
      ).length,
      1,
    );
  }
});

test("history is chronological, deduplicated, and bounded to two hours", () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({
    time: 10000 + i * 600,
    path: `/v2/radar/hash${i}`,
  }));
  const frames = pastObservations({
    host: "https://tilecache.rainviewer.com",
    radar: { past: [...entries.reverse(), entries[0]] },
  });
  assert.equal(frames.length, 13);
  assert.equal(frames.at(-1).time - frames[0].time, 7200);
  assert.ok(frames.every((frame, i) => !i || frame.time > frames[i - 1].time));
});

test("history publishes complete pairs atomically despite a failed newest frame", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-history-"));
  const image = await sharp({
    create: { width: 256, height: 256, channels: 4, background: "#3489bf" },
  })
    .png()
    .toBuffer();
  let times = [100, 200];
  let failure = null;
  let downloads = 0;
  const provider = {
    getHistory: async () => times.map((time) => ({ time })),
    getTile: async (frame) => {
      downloads++;
      if (frame.time === failure) throw new Error("Incomplete frame");
      return image;
    },
  };
  try {
    const radar = await createRadar(directory, provider, { settleMs: 0 });
    await radar.refresh();
    assert.deepEqual(
      radar.status().frames.map((frame) => frame.time),
      [100, 200],
    );
    times = [100, 200, 300, 400];
    failure = 400;
    await radar.refresh();
    assert.deepEqual(
      radar.status().frames.map((frame) => frame.time),
      [100, 200, 300],
    );
    const restored = await createRadar(directory, provider, { settleMs: 0 });
    assert.deepEqual(
      restored.status().frames.map((frame) => frame.time),
      [100, 200, 300],
    );
    downloads = 0;
    failure = null;
    await restored.refresh();
    assert.equal(
      downloads,
      radarTiles().length + radarTiles(overviewView).length,
      "Only the previously failed frame needs tiles",
    );
    assert.deepEqual(
      restored.status().frames.map((frame) => frame.time),
      [100, 200, 300, 400],
    );
    const offline = await createRadar(directory, {
      getHistory: async () => {
        throw new Error("Offline");
      },
    });
    await offline.refresh();
    assert.deepEqual(
      offline.status().frames.map((frame) => frame.time),
      [100, 200, 300, 400],
    );
    assert.ok(offline.status().error);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const failedView of ['main', 'overview']) test(`missing ${failedView} frame does not block newer pairs and can backfill after restart`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'radar-gap-'));
  const image = await sharp({ create: { width: 256, height: 256, channels: 4, background: '#3489bf' } }).png().toBuffer();
  let times = [600], fail = true, requests = [];
  const provider = {
    getHistory: async () => times.map(time => ({ time })),
    getTile: async (frame, tile) => {
      requests.push({ time: frame.time, zoom: tile.zoom });
      if (fail && frame.time === 1200 && tile.zoom === (failedView === 'main' ? view.radarZoom : overviewView.radarZoom)) throw new Error('Radar tile HTTP 404');
      return image;
    },
  };
  try {
    const events=[];
    const options={ waitForSettle: () => false, now: () => 2400000, onEvent: code=>events.push(code) };
    let radar = await createRadar(directory, provider, options);
    await radar.refresh();
    times = [600, 1200, 1800, 2400];
    await radar.refresh();
    assert.deepEqual(radar.status().frames.map(f => f.time), [600, 1800, 2400]);
    assert.equal(radar.status().error, null, 'A historical gap does not make the complete newest frame unhealthy');
    assert.deepEqual(radar.archive.window(2400).frames.map(f => f.time), [600, 1800, 2400]);
    assert.equal(events.at(-1),'radar-error');
    radar = await createRadar(directory, provider, options);
    requests = [];
    await radar.refresh();
    assert.deepEqual(radar.status().frames.map(f => f.time), [600, 1800, 2400]);
    assert.ok(requests.length > 0, 'Retry gaps even when the manifest has no newer timestamp');
    assert.ok(requests.every(r => r.time === 1200), 'Do not refetch complete frames');
    fail = false; requests = [];
    await radar.refresh();
    assert.equal(events.at(-1),'radar-recovered');
    assert.deepEqual(radar.status().frames.map(f => f.time), times);
    assert.ok(requests.every(r => r.time === 1200));
    if (failedView === 'overview') assert.ok(requests.every(r => r.zoom === overviewView.radarZoom), 'Reuse the already complete main image');
    assert.deepEqual(radar.archive.window(2400).frames.map(f => f.time), times);
    requests = [];
    await radar.refresh();
    assert.equal(requests.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('failed far-future observations retain the full last-good window', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'radar-gap-preserve-'));
  const image = await sharp({ create: { width: 256, height: 256, channels: 4, background: '#3489bf' } }).png().toBuffer();
  let times = [600, 1200], fail = false;
  const provider = { getHistory: async () => times.map(time => ({ time })), getTile: async () => {
    if (fail) throw new Error('Offline');
    return image;
  } };
  try {
    let radar = await createRadar(directory, provider, { settleMs: 0 });
    await radar.refresh();
    times = [12000, 12600]; fail = true;
    await radar.refresh();
    assert.deepEqual(radar.status().frames.map(f => f.time), [600, 1200]);
    assert.ok(radar.status().error);
    radar = await createRadar(directory, provider, { settleMs: 0 });
    assert.deepEqual(radar.status().frames.map(f => f.time), [600, 1200]);
    fail = false;
    await radar.refresh();
    assert.deepEqual(radar.status().frames.map(f => f.time), [12000, 12600]);
    assert.equal(radar.status().error, null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("provider chooses past observations only and rejects unsafe metadata", () => {
  const frame = latestObservation({
    host: "https://tilecache.rainviewer.com",
    radar: {
      past: [
        { time: 200, path: "/v2/radar/hash2" },
        { time: 100, path: "/v2/radar/hash1" },
      ],
      nowcast: [{ time: 900 }],
    },
  });
  assert.equal(frame.time, 200);
  assert.throws(() =>
    latestObservation({ host: "http://localhost", radar: { past: [] } }),
  );
  assert.throws(() =>
    latestObservation({
      host: "https://tilecache.rainviewer.com",
      radar: { past: [{ time: 200, path: "/../../bad" }] },
    }),
  );
});

test("failed acquisition preserves complete frame, restart restores it, recovery replaces it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-test-"));
  let time = 100;
  let fail = false;
  let count = 0;
  const image = await sharp({
    create: { width: 256, height: 256, channels: 4, background: "#3489bf" },
  })
    .png()
    .toBuffer();
  const provider = {
    getHistory: async () => [{ time }],
    getTile: async () => {
      count++;
      if (fail && count % 2 === 0) throw new Error("Simulated broken tile");
      return image;
    },
  };
  try {
    const radar = await createRadar(directory, provider, { settleMs: 0 });
    assert.equal(radar.status().frame, null);
    await radar.refresh();
    const first = radar.status().frame;
    assert.equal(first.time, 100);
    const original = await readFile(join(directory, first.file));
    const info = await sharp(original).metadata();
    assert.equal(info.width, 1280);
    assert.equal(info.height, 720);
    time = 200;
    fail = true;
    await radar.refresh();
    assert.equal(radar.status().frame.time, 100);
    assert.ok(radar.status().error);
    assert.deepEqual(await readFile(join(directory, first.file)), original);
    const restarted = await createRadar(directory, provider, { settleMs: 0 });
    assert.equal(restarted.status().frame.time, 100);
    fail = false;
    await restarted.refresh();
    assert.equal(restarted.status().frame.time, 200);
    assert.equal(restarted.status().error, null);
    const manifestPath = join(directory, "history.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.viewKey = "previous-view";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const changedView = await createRadar(directory, provider, { settleMs: 0 });
    assert.equal(
      changedView.status().frame,
      null,
      "A cached frame for a different map must never be displayed",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("overview failure cannot publish mismatched views; retry reuses the main image", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-pair-"));
  const image = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#3489bf" } }).png().toBuffer();
  let time = 100, failOverview = false, mainRequests = 0;
  const provider = {
    getHistory: async () => [{ time }],
    getTile: async (_, tile) => {
      if (tile.zoom === view.radarZoom) mainRequests++;
      if (failOverview && tile.zoom === overviewView.radarZoom) throw new Error("Overview unavailable");
      return image;
    },
  };
  try {
    const radar = await createRadar(directory, provider, { settleMs: 0 });
    await radar.refresh();
    const first = radar.status().frame;
    const pixels = await sharp(await readFile(join(directory, first.overviewFile))).raw().toBuffer({ resolveWithObject: true });
    assert.equal(pixels.info.width, 390);
    assert.equal(pixels.info.height, 280);
    for (let i = 3; i < pixels.data.length; i += 4) assert.equal(pixels.data[i], 255, "No gaps between overview tiles");
    time = 200; failOverview = true;
    await radar.refresh();
    assert.equal(radar.status().frame.time, 100);
    const restored = await createRadar(directory, provider, { settleMs: 0 });
    assert.equal(restored.status().frame.overviewUrl, first.overviewUrl);
    mainRequests = 0; failOverview = false;
    await restored.refresh();
    assert.equal(mainRequests, 0);
    assert.equal(restored.status().frame.time, 200);
    assert.ok(restored.status().frame.overviewUrl.includes("200-"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("settling delays new frames without downloads, survives restart, and preserves history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-settle-"));
  let clock = 1000000, times = [600, 1200], downloads = [];
  const image = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#3489bf" } }).png().toBuffer();
  const provider = { getHistory: async () => times.map(time => ({ time })), getTile: async frame => { downloads.push(frame.time); return image; } };
  try {
    let radar = await createRadar(directory, provider, { now: () => clock });
    await radar.refresh();
    assert.deepEqual(radar.status().frames.map(f => f.time), [600]);
    assert.ok(downloads.every(time => time === 600));
    downloads = [];
    clock += 299999;
    radar = await createRadar(directory, provider, { now: () => clock });
    await radar.refresh();
    assert.equal(downloads.length, 0);
    clock++;
    await radar.refresh();
    assert.equal(radar.status().frame.time, 1200);
    assert.ok(downloads.every(time => time === 1200));
    times = [1200, 1800]; downloads = [];
    await radar.refresh();
    assert.deepEqual(radar.status().frames.map(f => f.time), [600, 1200]);
    assert.equal(downloads.length, 0);
    clock += 300000;
    await radar.refresh();
    assert.deepEqual(radar.status().frames.map(f => f.time), [600, 1200, 1800]);
    assert.ok(downloads.every(time => time === 1800));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('settling changes take effect next acquisition, survive restart, and reuse complete cached pairs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'radar-policy-transition-'));
  t.after(() => rm(directory, {recursive:true,force:true}));
  let clock=1000000, wait=true, times=[600], downloads=0, manifests=0, release;
  const image=await sharp({create:{width:256,height:256,channels:4,background:'#3489bf'}}).png().toBuffer();
  let gate=null;
  const provider={getHistory:async()=>{manifests++;if(gate) await gate;return times.map(time=>({time}));},getTile:async()=>{downloads++;return image;}};
  const options={now:()=>clock,waitForSettle:()=>wait,nextRefreshAt:()=>clock+299000};
  let radar=await createRadar(directory,provider,options);
  gate=new Promise(resolve=>{release=resolve;});
  const pending=radar.refresh();
  wait=false; release(); await pending; gate=null;
  assert.equal(downloads,0,'In-flight acquisition retains its initial policy');
  assert.equal(manifests,1,'Toggling never initiates requests');
  assert.equal(radar.status().nextUpdate.expectedAt,1299000);
  await radar.refresh();
  const pairCount=radarTiles().length+radarTiles(overviewView).length;
  assert.equal(downloads,pairCount);assert.equal(radar.status().frame.time,600);
  wait=true;times=[600,1200]; await radar.refresh();
  assert.equal(downloads,pairCount,'Off-to-on holds the newly seen timestamp');
  clock+=300000;
  radar=await createRadar(directory,provider,options);await radar.refresh();
  assert.equal(downloads,2*pairCount,'Restart retains first-seen time and complete cache');
  assert.equal(radar.status().frame.time,1200);
  wait=false;await radar.refresh();assert.equal(downloads,2*pairCount);
  times=[3000,3600,4200];await radar.refresh();
  assert.equal(radar.status().frame.time,4200,'Off catches up including the newest frame');
  assert.equal(manifests,6);
});

test("a lone newest frame waits on empty-cache startup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-single-settle-"));
  let downloads = 0;
  try {
    const radar = await createRadar(directory, { getHistory: async () => [{ time: 600 }], getTile: async () => { downloads++; throw new Error("should wait"); } });
    await radar.refresh();
    assert.equal(downloads, 0);
    assert.equal(radar.status().frame, null);
    assert.equal(radar.status().error, null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("pending status estimates the eligible poll, reports acquisition and clears after publish", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-next-status-"));
  let clock = 1000000, poll = clock + 299000;
  const image = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#3489bf" } }).png().toBuffer();
  let radar;
  const provider = { getHistory: async () => [{ time: 600 }], getTile: async () => {
    assert.deepEqual(radar.status().nextUpdate, { state: "fetching" });
    return image;
  } };
  try {
    radar = await createRadar(directory, provider, { now: () => clock, nextRefreshAt: () => poll });
    assert.equal(radar.status().nextUpdate, null);
    await radar.refresh();
    assert.deepEqual(radar.status().nextUpdate, { state: "waiting", expectedAt: 1599000 });
    clock = 1599000; poll = clock + 300000;
    await radar.refresh();
    assert.equal(radar.status().nextUpdate, null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("manifest latency does not defer a new observation for an extra poll", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-poll-latency-"));
  let clock = 1000000, poll = clock + 300000, downloads = 0;
  const image = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#3489bf" } }).png().toBuffer();
  const provider = { getHistory: async () => { clock += 165; return [{ time: 600 }]; }, getTile: async () => { downloads++; return image; } };
  try {
    const radar = await createRadar(directory, provider, { now: () => clock, nextRefreshAt: () => poll });
    await radar.refresh(clock);
    assert.deepEqual(radar.status().nextUpdate, { state: "waiting", expectedAt: 1300000 });
    assert.equal(downloads, 0);
    clock = poll; poll = clock + 300000;
    await radar.refresh(clock);
    assert.equal(radar.status().frame.time, 600);
    assert.equal(radar.status().nextUpdate, null);
    assert.equal(downloads, radarTiles().length + radarTiles(overviewView).length);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("long-gap recovery loads older history immediately but holds newest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "radar-catchup-"));
  let clock = 1000000, times = [600], downloads = [];
  const image = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#3489bf" } }).png().toBuffer();
  const provider = { getHistory: async () => times.map(time => ({ time })), getTile: async frame => { downloads.push(frame.time); return image; } };
  try {
    let radar = await createRadar(directory, provider, { now: () => clock, settleMs: 0 });
    await radar.refresh();
    clock += 8 * 3600000; times = [28200, 28800, 29400]; downloads = [];
    radar = await createRadar(directory, provider, { now: () => clock });
    await radar.refresh();
    assert.deepEqual(radar.status().frames.map(f => f.time), [28200, 28800]);
    assert.ok(downloads.length > 0);
    assert.ok(!downloads.includes(29400));
    clock += 300000;
    await radar.refresh();
    assert.equal(radar.status().frame.time, 29400);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
