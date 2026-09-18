import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createSettingsAuth, setPin, SESSION_MS, settingsRoutes } from '../src/settings-auth.js';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'radar-pin-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test('PIN storage, expiry, logout, reset and restart invalidate sessions', async t => {
  const dir = await fixture(t);
  let time = 1_000_000;
  const auth = createSettingsAuth(dir, () => time);
  assert.equal(await auth.configured(), false);
  assert.equal((await auth.unlock('123456')).status, 409);
  await assert.rejects(setPin(dir, '123'));
  await setPin(dir, '123456');
  const record = await readFile(join(dir, 'settings/pin.json'), 'utf8');
  assert.equal(record.includes('123456'), false);
  if (process.platform !== 'win32') assert.equal((await stat(join(dir, 'settings/pin.json'))).mode & 0o777, 0o600);
  const first = await auth.unlock('123456');
  assert.equal(first.status, 200);
  assert.equal(await auth.authorized(first.token), true);
  assert.equal(await createSettingsAuth(dir).authorized(first.token), false);
  time += SESSION_MS;
  assert.equal(await auth.authorized(first.token), false);
  const second = await auth.unlock('123456');
  auth.lock(second.token);
  assert.equal(await auth.authorized(second.token), false);
  const third = await auth.unlock('123456');
  await setPin(dir, '654321');
  assert.equal(await auth.authorized(third.token), false);
  assert.equal((await auth.unlock('654321')).status, 200);
});
test('failed guesses are throttled persistently and concurrent checks are bounded', async t => {
  const dir = await fixture(t);
  let time = 1_000_000;
  await setPin(dir, '123456');
  const auth = createSettingsAuth(dir, () => time);
  const failing = auth.unlock('000000');
  assert.equal((await auth.unlock('123456')).status, 429);
  assert.equal((await failing).retryAfter, 2);
  const restarted = createSettingsAuth(dir, () => time);
  assert.equal((await restarted.unlock('123456')).status, 429);
  time += 2000;
  assert.equal((await restarted.unlock('000000')).retryAfter, 4);
  time += 4000;
  assert.equal((await restarted.unlock('123456')).status, 200);
});
test('HTTP settings require bearer authorization and reject cross-origin/form/oversized input', async t => {
  const dir = await fixture(t);
  await setPin(dir, '123456');
  let savedKey = null;
  let applied=0,previews=0;
  const mapState={name:'Coventry',lat:52.4081,lon:-1.5106,zoom:8,overviewZoom:4.94};
  const route = settingsRoutes(createSettingsAuth(dir), {configured:()=>!!savedKey, configure:async key=>{savedKey=key;return {status:200,apiKeyConfigured:true};}}, {current:()=>({settings:mapState}),status:()=>({busy:false,error:null}),preview:async()=>{previews++;return {status:200,main:"<svg/>",overview:"<svg/>"};},configure:()=>{applied++;return {status:202};}});
  const server = createServer((req, res) => route(req, res, req.url));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  assert.equal((await fetch(base + '/api/settings')).status, 401);
  assert.equal((await post('/api/settings/unlock', '{"pin":"123456"}', { Origin: 'https://example.com' })).status, 403);
  assert.equal((await post('/api/settings/unlock', 'pin=123456', { 'Content-Type': 'application/x-www-form-urlencoded' })).status, 403);
  assert.equal((await post('/api/settings/unlock', 'x'.repeat(257))).status, 413);
  const login = await post('/api/settings/unlock', '{"pin":"123456"}');
  assert.equal(login.headers.get('cache-control'), 'no-store');
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const settings = await fetch(base + '/api/settings', { headers });
  assert.equal(settings.status, 200);
  assert.deepEqual(await settings.json(), { pinConfigured: true, apiKeyConfigured: false,map:mapState,mapUpdate:{busy:false,error:null} });
  assert.equal((await post('/api/settings/map',JSON.stringify(mapState))).status,401);
  assert.equal((await post('/api/settings/map',JSON.stringify(mapState),{...headers,Origin:'https://example.com'})).status,403);
  assert.equal((await post('/api/settings/map','x'.repeat(1025),headers)).status,413);
  assert.equal((await post('/api/settings/map/preview',JSON.stringify(mapState))).status,401);
  assert.equal((await post('/api/settings/map/preview',JSON.stringify(mapState),{...headers,Origin:'https://example.com'})).status,403);
  assert.equal((await post('/api/settings/map/preview','x'.repeat(1025),headers)).status,413);
  assert.equal(previews,0);
  assert.equal((await post('/api/settings/map/preview',JSON.stringify(mapState),headers)).status,200);
  assert.equal(previews,1);
  assert.equal(applied,0);
  assert.equal((await post('/api/settings/map',JSON.stringify(mapState),headers)).status,202);
  assert.equal(applied,1);
  assert.equal((await post('/api/settings/openweather', JSON.stringify({apiKey:'a'.repeat(32)}))).status,401);
  assert.equal(savedKey,null);
  assert.equal((await post('/api/settings/openweather', JSON.stringify({apiKey:'a'.repeat(32)}), {...headers, Origin:'https://example.com'})).status,403);
  assert.equal((await post('/api/settings/openweather', JSON.stringify({apiKey:'a'.repeat(32)}), headers)).status,200);
  assert.equal(savedKey,'a'.repeat(32));
  assert.equal((await (await fetch(base+'/api/settings',{headers})).json()).apiKeyConfigured,true);
  await post('/api/settings/lock', '{}', headers);
  assert.equal((await fetch(base + '/api/settings', { headers })).status, 401);
});


test('optional PIN permits all settings until enabled and preserves protection through changes/restarts', async t => {
  const dir = await fixture(t);
  const auth = createSettingsAuth(dir);
  let savedKey = '', applied = 0, previews = 0;
  const route = settingsRoutes(auth,
    { configured: () => !!savedKey, configure: async key => { savedKey = key; return { status: 200 }; } },
    { current: () => ({ settings: { name: 'Coventry' } }), status: () => ({}),
      configure: () => { applied++; return { status: 202 }; }, preview: async () => { previews++; return { status: 200 }; } });
  const server = createServer((req, res) => route(req, res, req.url));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/settings`;
  const post = (path, data, token, extra = {}) => fetch(base + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra
  }, body: JSON.stringify(data) });
  const pin = { enabled: true, pin: '123456', confirmation: '123456' };
  assert.equal(await auth.authorized(), true);
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await post('/map', {})).status, 202);
  assert.equal((await post('/map/preview', {})).status, 200);
  assert.equal((await post('/openweather', { apiKey: 'a'.repeat(32) })).status, 200);
  assert.equal(applied, 1); assert.equal(previews, 1);
  assert.equal((await (await fetch(base)).text()).includes(savedKey), false);
  for (const path of ['/pin', '/map', '/map/preview', '/openweather']) {
    assert.equal((await post(path, pin, null, { Origin: 'https://example.com' })).status, 403);
    assert.equal((await post(path, pin, null, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await post(path, pin, null, { 'Content-Type': 'text/plain' })).status, 403);
  }
  for (const data of [null, {}, { enabled: 'yes' }, { ...pin, pin: '123' }, { ...pin, confirmation: '654321' }]) {
    assert.equal((await post('/pin', data)).status, 400);
    assert.equal(await auth.configured(), false);
  }
  assert.equal((await post('/pin', { ...pin, extra: 'x'.repeat(257) })).status, 413);
  assert.equal((await post('/pin', pin)).status, 200);
  assert.equal(await createSettingsAuth(dir).authorized(), false);
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await post('/pin', { enabled: false })).status, 401);
  assert.equal((await post('/pin', pin)).status, 401);
  assert.equal((await post('/openweather', { apiKey: '' })).status, 401);
  const first = await auth.unlock('123456');
  const second = await auth.unlock('123456');
  assert.equal((await post('/pin', { ...pin, pin: '654321', confirmation: '654321' }, first.token)).status, 200);
  assert.equal(await auth.authorized(first.token), false);
  assert.equal(await auth.authorized(second.token), false);
  const changed = await auth.unlock('654321');
  assert.equal(changed.status, 200);
  assert.equal((await post('/pin', { enabled: false }, changed.token)).status, 200);
  assert.equal(await auth.authorized(), true);
  assert.equal(await createSettingsAuth(dir).configured(), false);
  assert.equal(await createSettingsAuth(dir).authorized(), true);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'settings/pin.json'), 'utf8')), { disabled: true });
  assert.equal((await post('/pin', pin)).status, 200);
  assert.equal(await auth.authorized(changed.token), false);
  assert.equal((await auth.unlock('123456')).status, 200);
});

test('competing PIN enrollment requests cannot overwrite the winning PIN', async t => {
  const dir = await fixture(t);
  const auth = createSettingsAuth(dir);
  const first = auth.configure({ enabled: true, pin: '123456', confirmation: '123456' });
  assert.equal((await auth.configure({ enabled: true, pin: '654321', confirmation: '654321' })).status, 429);
  assert.equal((await first).status, 200);
  assert.equal((await auth.configure({ enabled: false })).status, 401);
  assert.equal((await auth.unlock('123456')).status, 200);
});

test('activity renews only a live token; reads, expiry, lock and PIN changes cannot revive it', async t => {
  const dir=await fixture(t); let time=1000000; await setPin(dir,'123456');
  const auth=createSettingsAuth(dir,()=>time),first=await auth.unlock('123456');
  time+=299000;assert.equal(await auth.authorized(first.token),true);
  const renewed=await auth.renew(first.token);assert.equal(renewed.expiresAt,time+SESSION_MS);
  time+=SESSION_MS;assert.equal((await auth.renew(first.token)).status,401);
  const second=await auth.unlock('123456');auth.lock(second.token);assert.equal((await auth.renew(second.token)).status,401);
  const third=await auth.unlock('123456');await setPin(dir,'654321');assert.equal((await auth.renew(third.token)).status,401);
});

test('activity HTTP endpoint retains same-origin and bearer checks',async t=>{
  const dir=await fixture(t);await setPin(dir,'123456');const auth=createSettingsAuth(dir),session=await auth.unlock('123456');
  const route=settingsRoutes(auth),server=createServer((req,res)=>route(req,res,req.url));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const url=`http://127.0.0.1:${server.address().port}/api/settings/activity`;
  const request=headers=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'});
  assert.equal((await request({})).status,401);
  assert.equal((await request({Authorization:`Bearer ${session.token}`,Origin:'https://elsewhere.invalid'})).status,403);
  assert.equal((await request({Authorization:`Bearer ${session.token}`})).status,200);
  auth.lock(session.token);assert.equal((await request({Authorization:`Bearer ${session.token}`})).status,401);
});
