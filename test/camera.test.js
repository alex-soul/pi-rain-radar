import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {createCamera,cameraHistory,cameraCounts,matchCamera,cameraConfig} from '../src/camera.js';
import {decodeCameraImage} from '../src/camera-image.js';
import {cameraExifTime} from '../src/camera-time.js';
import {createHistoryStore} from '../src/history-store.js';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {settingsRoutes,createSettingsAuth,setPin} from '../src/settings-auth.js';

const initial=Math.floor(Date.now()/600000)*600000,minute=60000;
const direct={name:'Drive',mode:'direct',url:'http://camera.test/image?key=secret',auth:{mode:'basic',username:'user',password:'secret'}};
const png=await sharp({create:{width:64,height:48,channels:3,background:'#123456'}}).png().toBuffer();
async function fixture(t,options={}){
  const directory=await mkdtemp(join(tmpdir(),'radar-camera-')),store=await createHistoryStore(directory,{now:initial+86400000});
  let clock=initial,camera;const get=options.get??(async()=>png);
  const open=async()=>camera=await createCamera(directory,{store,now:()=>clock,get,autoStart:false,...options});
  t.after(async()=>{await camera?.close();await store.close();await rm(directory,{recursive:true,force:true});});
  await open();return {directory,store,get camera(){return camera;},open,setTime:v=>clock=v};
}
async function idle(camera){for(let i=0;i<200&&camera.status().collecting;i++)await new Promise(r=>setTimeout(r,10));assert.equal(camera.status().collecting,false);}
test('decode strips metadata, preserves aspect ratio, bounds dimensions and rejects malformed images',async()=>{
  const result=await decodeCameraImage(png,initial);assert.equal(result.basis,'acquisition');assert.equal(result.time,initial);assert.equal(result.width,64);assert.equal(result.height,48);assert.equal((await sharp(result.bytes).metadata()).exif,undefined);
  const large=await sharp({create:{width:3000,height:1500,channels:3,background:'#fff'}}).png().toBuffer();
  const resized=await decodeCameraImage(large,initial);assert.equal(resized.width,640);assert.equal(resized.height,320);
  const oriented=await sharp({create:{width:1200,height:2400,channels:3,background:'#fff'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const turned=await decodeCameraImage(oriented,initial);assert.equal(turned.width,640);assert.equal(turned.height,320);assert.equal((await sharp(turned.bytes).metadata()).orientation,undefined);
  await assert.rejects(decodeCameraImage(Buffer.from('<svg><script>secret</script></svg>'),initial),{code:'CAMERA_IMAGE'});
  await assert.rejects(decodeCameraImage(Buffer.alloc(8*1024*1024+1),initial),{code:'CAMERA_IMAGE'});
  const controller=new AbortController();controller.abort();await assert.rejects(decodeCameraImage(png,initial,{signal:controller.signal}),{code:'CAMERA_CANCELLED'});
});
test('EXIF exposure requires offset; old valid times survive and future/invalid dates fall back',async()=>{
  const bytes=await sharp(png).jpeg().withExif({IFD2:{DateTimeOriginal:'2026:09:19 10:00:00',OffsetTimeOriginal:'+01:00'}}).toBuffer();
  const exif=(await sharp(bytes).metadata()).exif;
  assert.equal(cameraExifTime(exif,initial),Date.UTC(2026,8,19,9));
  assert.equal(cameraExifTime(exif,Date.UTC(2026,8,18)),null);
  const missing=await sharp(png).jpeg().withExif({IFD2:{DateTimeOriginal:'2026:09:19 10:00:00'}}).toBuffer();assert.equal(cameraExifTime((await sharp(missing).metadata()).exif,initial),null);
  assert.equal(cameraExifTime(Buffer.from('broken'),initial),null);
});
test('test-before-save, five-minute collection, unchanged-image expiry, restart and enable/disable preserve history',async t=>{
  let calls=0;const events=[];const f=await fixture(t,{get:async()=>{calls++;return png;},onEvent:code=>events.push(code)}),c=f.camera;
  await assert.rejects(c.configure({enabled:true}),{code:'CAMERA_DRAFT'});
  const draft=await c.test(direct);assert.ok(c.preview(draft.ticket));assert.equal(c.status().configured,false);
  const saved=await c.configure({ticket:draft.ticket,enabled:true});await idle(c);assert.equal(calls,2);
  assert.equal(c.status().state,'fresh');assert.equal((await c.live()).counts.acquisition,1);
  await c.collect();assert.equal(calls,2);
  f.setTime(initial+5*minute);await c.collect();assert.equal(calls,3);assert.equal(c.status().snapshotTime,initial);
  assert.equal(c.status().unchanged,true);assert.equal((await c.live()).counts.acquisition,1);assert.equal(events.at(-1),'camera-unchanged');
  f.setTime(initial+10*minute+1);await c.collect();assert.equal(c.status().state,'stale');assert.equal((await c.live()).latest,null);assert.equal(events.at(-1),'camera-stale');
  await c.configure({enabled:false});const previous=calls;f.setTime(initial+15*minute);await c.collect();assert.equal(calls,previous);
  await c.close();await f.open();assert.equal(f.camera.status().source,saved.source);assert.equal(f.camera.status().snapshotTime,initial);
  await f.camera.configure({enabled:true});await idle(f.camera);assert.equal(calls,previous+1);assert.equal(f.camera.status().snapshotTime,initial);
  assert.equal(JSON.stringify(f.camera.status()).includes('secret'),false);
  assert.equal((await cameraHistory(f.store,initial+15*minute,2)).records.length,1);
});

test('Live image uses current time while counts follow the exact selected radar window',async t=>{
  const f=await fixture(t),c=f.camera,d=await c.test(direct);await c.configure({ticket:d.ticket,enabled:true});await idle(c);
  const view=await c.live(2,initial-600000);
  assert.deepEqual(view.counts,{metadata:0,acquisition:0});assert.equal(view.latest.time,initial);
});
test('camera source changes preserve continuous archive, exact lookback and window-specific counts',async t=>{
  const f=await fixture(t),c=f.camera;let draft=await c.test(direct);await c.configure({ticket:draft.ticket,enabled:true});await idle(c);
  const first=c.status().source;f.setTime(initial+5*minute);draft=await c.test({...direct,url:'http://camera.test/other'});await c.configure({ticket:draft.ticket,enabled:true});await idle(c);
  assert.notEqual(c.status().source,first);
  f.setTime(initial+10*minute);await c.collect();
  const h=await cameraHistory(f.store,initial+10*minute,2);assert.equal(h.records.length,2);assert.equal((await c.live()).counts.acquisition,1);
  assert.equal(matchCamera(h.records,initial-1),null);assert.equal(matchCamera(h.records,initial+15*minute).time,initial+5*minute);assert.equal(matchCamera(h.records,initial+15*minute+1),null);
  assert.deepEqual(cameraCounts(h.records,initial+1,initial+5*minute),{metadata:0,acquisition:1});
  assert.equal(h.records[0].asset.startsWith('/archive/media/'),true);
});
test('failed replacement keeps current source, auth errors create no fresh snapshot and later new data recovers',async t=>{
  let bad=false,color='#123456';const f=await fixture(t,{get:async()=>{if(bad)throw Object.assign(Error('password=secret'),{code:'CAMERA_AUTH'});return sharp({create:{width:64,height:48,channels:3,background:color}}).png().toBuffer();}}),c=f.camera;
  let d=await c.test(direct);await c.configure({ticket:d.ticket,enabled:true});await idle(c);const source=c.status().source;
  bad=true;await assert.rejects(c.test({...direct,url:'http://camera.test/new'}));assert.equal(c.status().source,source);
  f.setTime(initial+5*minute);await c.collect();assert.equal(c.status().state,'authentication');assert.equal(c.status().snapshotTime,initial);assert.equal(JSON.stringify(c.status()).includes('secret'),false);
  bad=false;color='#abcdef';f.setTime(initial+15*minute);await c.collect();assert.equal(c.status().state,'fresh');assert.equal(c.status().snapshotTime,initial+15*minute);
});
test('HA selection only returns camera identities; collection uses the proxy and bearer token',async t=>{
  const requests=[];const f=await fixture(t,{get:async(url,options)=>{requests.push({url,auth:options.auth});return url.endsWith('/api/states')?Buffer.from(JSON.stringify([{entity_id:'light.private',attributes:{token:'secret'}},{entity_id:'camera.drive',attributes:{friendly_name:'Drive',access_token:'secret'}}])):png;}}),c=f.camera;
  const input={mode:'ha',name:'Drive',url:'http://homeassistant.local:8123',token:'secret',entity:'camera.drive'};
  assert.deepEqual(await c.discover(input),[{id:'camera.drive',name:'Drive'}]);
  const d=await c.test(input);await c.configure({ticket:d.ticket,enabled:true});await idle(c);
  assert.equal(requests.at(-1).url,'http://homeassistant.local:8123/api/camera_proxy/camera.drive');assert.deepEqual(requests.at(-1).auth,{mode:'bearer',token:'secret'});
  await c.configure({name:''});await idle(c);assert.equal(c.status().name,'');
  await c.close();await f.open();assert.equal(f.camera.status().entity,'camera.drive');assert.equal(f.camera.status().name,'');
});
test('parallel pollers are rejected, cancellation stops work, and damaged optional configuration does not stop radar',async t=>{
  const f=await fixture(t,{get:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))}),c=f.camera;
  const pending=c.test(direct);await assert.rejects(c.test(direct),{code:'CAMERA_BUSY'});await c.close();await assert.rejects(pending);
  await writeFile(join(f.directory,'settings','camera.json'),'broken');await f.open();assert.equal(f.camera.status().configured,false);assert.ok(f.camera.status().error);assert.equal(await readFile(join(f.directory,'settings','camera.json'),'utf8'),'broken');
});
test('configuration rejects header injection and conflicting URL credentials',()=>{
  assert.throws(()=>cameraConfig({...direct,auth:{mode:'bearer',token:'abc\r\nHost: bad'}}),{code:'CAMERA_CONFIG'});
  assert.throws(()=>cameraConfig({...direct,url:'http://user:secret@camera.test/image'}),{code:'CAMERA_AUTH_CONFIG'});
});

test('disable cancels a running poll without publication and expired drafts cannot replace the saved source',async t=>{
  let slow=false,stopped=false;
  const f=await fixture(t,{get:async(_u,{signal})=>{
    if(slow)return new Promise((_,reject)=>signal.addEventListener('abort',()=>{stopped=true;reject(Error('cancelled'));},{once:true}));return png;
  }}),c=f.camera;
  const d=await c.test(direct);await c.configure({ticket:d.ticket,enabled:true});await idle(c);
  const source=c.status().source;
  slow=true;f.setTime(initial+5*minute);const poll=c.collect();await new Promise(r=>setTimeout(r,30));await c.configure({enabled:false});await poll;
  assert.equal(stopped,true);assert.equal(c.status().enabled,false);assert.equal((await cameraHistory(f.store,initial+5*minute,2)).records.length,1);
  slow=false;const replacement=await c.test({...direct,url:'http://camera.test/new'});f.setTime(initial+11*minute);
  await assert.rejects(c.configure({ticket:replacement.ticket,enabled:true}),{code:'CAMERA_DRAFT'});assert.equal(c.status().source,source);assert.equal(c.preview(replacement.ticket),null);
});

test('camera Settings enforce PIN and same-origin JSON, redact credentials, and keep HTTP responsive during faults',async t=>{
  let slow=false;const f=await fixture(t,{get:async(_url,{signal})=>{
    if(slow)await new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Object.assign(Error('secret'),{code:'CAMERA_TIMEOUT'})),100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('cancelled'));},{once:true});});
    return png;
  }});
  await setPin(f.directory,'123456');const auth=createSettingsAuth(f.directory),routes=settingsRoutes(auth,null,null,{camera:f.camera});
  const server=createServer((req,res)=>{if(req.url==='/healthz'){res.end('ok');return;}void routes(req,res,new URL(req.url,'http://localhost').pathname);});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${server.address().port}`,token=(await auth.unlock('123456')).token;
  const request=(path,data,headers={})=>fetch(url+'/api/settings/camera'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});
  assert.equal((await fetch(url+'/api/settings/camera')).status,401);
  assert.equal((await request('/test',direct,{Origin:'http://evil.example'})).status,403);
  const d=await (await request('/test',direct)).json();assert.ok(d.ticket);assert.equal(JSON.stringify(d).includes('secret'),false);
  const preview=await request('/preview?ticket='+d.ticket);assert.equal(preview.headers.get('cache-control'),'no-store');assert.equal(preview.headers.get('content-type'),'image/jpeg');assert.ok((await preview.arrayBuffer()).byteLength);
  assert.equal((await request('',{ticket:d.ticket,enabled:false})).status,200);assert.equal((await request('')).status,200);assert.equal((await (await request('')).text()).includes('secret'),false);
  slow=true;const pending=request('/test',direct);assert.equal(await (await fetch(url+'/healthz')).text(),'ok');const failure=await pending;assert.equal(failure.status,400);assert.equal((await failure.text()).includes('secret'),false);assert.equal(f.camera.status().configured,true);
  assert.equal((await request('',{ticket:d.ticket,enabled:true})).status,400);
});


test('name-only camera edits preserve secret connection and identity, allow blank, and do not relabel archive',async t=>{
 let calls=0;const events=[];const f=await fixture(t,{get:async()=>{calls++;return png;},onEvent:code=>events.push(code)}),c=f.camera;
 const draft=await c.test(direct);const saved=await c.configure({ticket:draft.ticket,enabled:true});await idle(c);
 const before=calls,records=await cameraHistory(f.store,initial,2);
 await c.configure({name:''});await idle(c);assert.equal(c.status().name,'');assert.equal(c.status().source,saved.source);assert.equal(calls,before);
 assert.equal(JSON.stringify(c.status()).includes('key=secret'),false);
 const later=await cameraHistory(f.store,initial,2);assert.deepEqual(later,records);
 await c.close();await f.open();assert.equal(f.camera.status().name,'');assert.equal(f.camera.status().source,saved.source);
 await assert.rejects(f.camera.configure({name:'New',url:'http://other.test/'}),{code:'CAMERA_CONFIG'});
});

 test('capture interval validates 1-10 minutes and persists independently of identity',async t=>{
 const f=await fixture(t),c=f.camera,d=await c.test(direct);await c.configure({ticket:d.ticket,enabled:true,intervalMinutes:1});await idle(c);
 assert.equal(c.status().intervalMinutes,1);assert.equal(c.status().nextCollection,initial+minute);
 for(const intervalMinutes of [0,11,1.5,'2'])await assert.rejects(c.configure({enabled:true,intervalMinutes}),{code:'CAMERA_CONFIG'});
 await c.configure({enabled:true,intervalMinutes:10});await idle(c);assert.equal(c.status().nextCollection,initial+10*minute);
 await c.close();await f.open();assert.equal(f.camera.status().intervalMinutes,10);
 });
