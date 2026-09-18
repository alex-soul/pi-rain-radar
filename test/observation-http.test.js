import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { defaultViews } from '../src/map.js';

test('HTTP Archive accepts 1–24 while Live remains 2/4/6, with truthful per-map availability', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-http-observations-'));
  const end = Math.floor(Date.now() / 600000) * 600;
  for (const [view, key] of [[defaultViews.view, defaultViews.viewKey], [defaultViews.overviewView, defaultViews.overviewKey]]) {
    const image = await sharp({ create: { width: view.width, height: view.height, channels: 4, background: '#00000000' } }).png().toBuffer();
    for (let i = 0; i <= 12; i++) {
      if (key === defaultViews.overviewKey && i === 1) continue;
      await writeFile(join(dir, `${end - i * 600}-${key}.png`), image);
    }
  }
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['src/server.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATA_DIR: dir, BIND_ADDRESS: '127.0.0.1', PORT: String(port), RADAR_MANUAL_REFRESH: '1' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Fixture server startup timed out')), 20000);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', () => { clearTimeout(timer); reject(Error('Fixture server exited before readiness')); });
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening on port')) { clearTimeout(timer); resolve(); } });
    child.stderr.resume();
  });
  const get = path => fetch(`http://127.0.0.1:${port}${path}`);
  const manifestResponse=await get('/manifest.webmanifest');
  assert.equal(manifestResponse.status,200);
  assert.match(manifestResponse.headers.get('content-type'),/application\/manifest\+json/);
  assert.equal(manifestResponse.headers.get('cache-control'),'no-cache');
  assert.match(manifestResponse.headers.get('content-security-policy'),/default-src 'self'/);
  const manifest=await manifestResponse.json();
  assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons) {
    const response=await get(icon.src);assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/png');
    const metadata=await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.equal(`${metadata.width}x${metadata.height}`,icon.sizes);
  }
  const page=await (await get('/')).text();
  assert.match(page,/rel="manifest" href="\/manifest.webmanifest"/);
  assert.equal((await get('/service-worker.js')).status,404);
  for (const hours of [1, 2, 3, 6, 24]) {
    const response = await get(`/api/archive?end=${end}&hours=${hours}`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.playable, Math.min(hours * 6 + 1, 13));
    assert.equal(result.complete, false);
    assert.equal(result.frames.find(f => f.time === end - 600).overviewUrl, null);
  }
  for (const hours of ['0', '25', '1.5', '02', 'NaN']) assert.equal((await get(`/api/archive?hours=${hours}`)).status, 404);
  for (const hours of [2, 4, 6]) {
    const response = await get(`/api/status?hours=${hours}`); assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.end - status.start, hours * 3600);
    assert.equal(status.sources.main.nextCheckAt, null);
    assert.ok(!JSON.stringify(status).includes('apiKey'));
  }
  assert.equal((await get('/api/status?hours=24')).status, 400);
  assert.equal((await get('/api/archive?map=other')).status, 409);
  assert.ok((await (await get('/api/archive')).json()).times.includes(end));
});
