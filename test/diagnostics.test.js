import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createDiagnostics } from '../src/diagnostics.js';
import { createRadarSettings } from '../src/radar-settings.js';
import { createSettingsAuth, settingsRoutes, setPin } from '../src/settings-auth.js';

test('live log bounds events, groups repeats, rejects untrusted text and clears on restart', () => {
  let now = 1000;
  const log = createDiagnostics({now:()=>now});
  log.record('weather-error'); now += 1000; log.record('weather-error');
  const first = log.snapshot().events[0];
  assert.equal(first.count, 2); assert.notEqual(first.time, first.lastAt);
  for (let i=0;i<11000;i++) log.record('weather-error');
  assert.equal(log.snapshot().events[0].count,9999);
  log.record('https://provider/?appid=secret'); log.record('__proto__');
  assert.equal(log.snapshot().events.length, 1);
  first.message='secret'; assert.ok(!JSON.stringify(log.snapshot()).includes('secret'));
  for(let i=0;i<30;i++) log.record(i%2?'radar-error':'radar-recovered');
  assert.equal(log.snapshot().events.length,25);
  assert.equal(log.snapshot().events[0].id,7);
  assert.equal(createDiagnostics().snapshot().events.length,0);
});

test('radar policy persists, validates, and shares existing PIN and cross-origin protection', async t => {
  const dir=await mkdtemp(join(tmpdir(),'radar-policy-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const diagnostics=createDiagnostics();
  const radarSettings=await createRadarSettings(dir,{onEvent:diagnostics.record});
  assert.equal(radarSettings.waitForSettle(),true);
  assert.equal((await radarSettings.configure({waitForSettle:'false'})).status,400);
  await setPin(dir,'123456');
  const auth=createSettingsAuth(dir);
  const route=settingsRoutes(auth,null,null,{diagnostics,radarSettings});
  const server=createServer((req,res)=>route(req,res,req.url));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api/settings`;
  const post=(body,headers={})=>fetch(base+'/radar',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/diagnostics')).status,401);
  assert.equal((await post({waitForSettle:false})).status,401);
  const {token}=await auth.unlock('123456');
  const headers={Authorization:`Bearer ${token}`};
  assert.equal((await post({waitForSettle:false},{...headers,Origin:'https://example.com'})).status,403);
  assert.equal((await post({waitForSettle:false},headers)).status,200);
  assert.equal(radarSettings.waitForSettle(),false);
  assert.equal((await createRadarSettings(dir)).waitForSettle(),false);
  const shared=await (await fetch(base+'/diagnostics',{headers})).json();
  assert.equal(shared.events.at(-1).code,'settling-off');
  assert.equal((await (await fetch(base,{headers})).json()).radar.waitForSettle,false);
  auth.lock(token);
  assert.equal((await fetch(base+'/diagnostics',{headers})).status,401);
});


test('cloud and camera routine successes stay quiet, with one recovery per failure',()=>{
 const log=createDiagnostics();
 for(let i=0;i<40;i++)for(const code of ['cloud-collected','camera-collected','camera-unchanged'])log.record(code);
 assert.equal(log.snapshot().events.length,0);
 log.record('cloud-error');log.record('camera-stale');
 log.record('cloud-collected');log.record('camera-stale');log.record('cloud-collected');
 assert.equal(log.snapshot().events.filter(e=>e.code==='cloud-recovered').length,1);
 assert.equal(log.snapshot().events.filter(e=>e.code==='camera-recovered').length,0);
 log.record('camera-collected');log.record('camera-collected');log.record('camera-unchanged');
 assert.equal(log.snapshot().events.filter(e=>e.code==='camera-recovered').length,1);
 log.record('camera-error');log.record('camera-unchanged');
 assert.equal(log.snapshot().events.filter(e=>e.code==='camera-recovered').length,2);
 assert.ok(!log.snapshot().events.some(e=>['camera-collected','camera-unchanged','cloud-collected'].includes(e.code)));
});
