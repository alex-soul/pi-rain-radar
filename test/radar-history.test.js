import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createHistoryStore} from '../src/history-store.js';
import {createRadarSources} from '../src/radar-sources.js';
import {createRadarHistory} from '../src/radar-history.js';
import {createStorageStatus} from '../src/storage-status.js';
import {createMapSettings} from '../src/map-settings.js';
import {createWeather} from '../src/weather.js';
import {hash} from '../src/map.js';
const views={view:{lat:0,lon:0,zoom:0,radarZoom:0,width:128,height:128},viewKey:'111111111111',overviewView:{lat:0,lon:0,zoom:1,radarZoom:1,width:128,height:128},overviewKey:'222222222222'};
const png=await sharp({create:{width:256,height:256,channels:4,background:'#329db3'}}).png().toBuffer();
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'sqlite-radar-'));const store=await createHistoryStore(dir);t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});return {dir,store};}

test('SQLite acquisition seeds two hours, preserves 4/6h gaps and survives restart without sidecars',async t=>{
  const {dir,store}=await fixture(t),time=Math.floor(Date.now()/600000)*600000;
  const provider={getHistory:async()=>Array.from({length:13},(_,i)=>({time:time/1000-(12-i)*600})),getTile:async()=>png};
  const options={store,views,now:()=>time+300000,waitForSettle:()=>false,selection:()=>({main:'rainviewer',overview:'same'})};
  const radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},options);
  await radar.refresh();
  assert.equal(radar.status().frames.length,13);assert.ok(radar.status().frames.every(f=>f.url.startsWith('/archive/media/')&&f.overviewUrl));
  assert.ok(radar.status(4).counts.main.missing>radar.status(2).counts.main.missing);
  assert.ok(radar.status(6).counts.main.missing>radar.status(4).counts.main.missing);
  const generation=(await store.status()).generation;
  const restored=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},options);
  assert.deepEqual(restored.status().frames,radar.status().frames);
  assert.equal((await store.status()).generation,generation);
  assert.equal((await readdir(dir)).some(f=>/^(history|settling|observations|captured)|\.png$/.test(f)),false);
});

test('shared pruning does not mutate a returned window and calendar exposes only surviving history',async t=>{
  const {store}=await fixture(t),time=Math.floor(Date.now()/600000)*600000,context=hash(views);
  for(const offset of [172800000,0])for(const role of ['main','overview'])await store.publish({kind:'radar',source:'rainviewer',context,role,time:time-offset,receivedAt:time,data:{}},png);
  const archive=await createRadarHistory(store,views,{now:()=>time+300000,selection:{main:'rainviewer',overview:'same'}});
  const old=await archive.window(time/1000-172800,2);assert.equal(old.frames.length,1);
  await store.protect([{context,main:'rainviewer',overview:'rainviewer'}]);await store.setRetention(1);
  assert.equal((await archive.window(time/1000-172800,2)),null);
  assert.equal(old.frames.length,1);assert.equal((await archive.available(time-3*86400000,time)).times.length,1);
  await archive.reload();assert.ok(archive.live().frames.length);
});

test('pressure can roll beyond a stalled radar while bounded Live survives restart and avoids expired backfill',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-live-protection-')),time=Math.floor(Date.now()/600000)*600000,context=hash(views);
  let store=await createHistoryStore(dir,{now:time});
  t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  await store.protect([{context,main:'rainviewer',overview:'rainviewer'}]);
  for(const role of ['main','overview'])await store.publish({kind:'radar',source:'rainviewer',context,role,time:time-600000,receivedAt:time,data:{}},png);
  await store.put([{kind:'weather',source:'openweather',context:'here',time,receivedAt:time,data:{tempC:12}}]);
  let archive=await createRadarHistory(store,views,{now:()=>time+300000,selection:{main:'rainviewer',overview:'same'}});
  for(let i=0;i<10&&(await store.status()).cutoff<=time;i++)await store.maintain({space:{capacity:1024**3,available:0}});
  assert.ok((await store.status()).cutoff>time);
  assert.equal(await archive.window(time/1000-600,2),null);
  await archive.reload();assert.equal(archive.live().frames.length,1);
  assert.ok(archive.live().frames[0].url&&archive.live().frames[0].overviewUrl);
  await store.close();store=await createHistoryStore(dir,{now:time});
  const requested=new Set(),provider={getHistory:async()=>Array.from({length:13},(_,i)=>({time:time/1000-(12-i)*600})),getTile:async frame=>{requested.add(frame.time);return png;}};
  const radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},{store,views,now:()=>time+300000,waitForSettle:()=>false,selection:()=>({main:'rainviewer',overview:'same'})});
  assert.equal(radar.status().frames[0].time,time/1000-600);
  await radar.refresh();
  assert.deepEqual([...requested],[time/1000]);
  assert.equal(radar.status().frames.at(-1).time,time/1000);
  assert.equal(await radar.archive.window(time/1000,2),null,'Live protection does not resurrect expired Archive');
  await store.maintain();assert.equal((await store.status()).records,2);
});

test('switching back to an inactive source reacquires its pressure-pruned images',async t=>{
  const {dir,store}=await fixture(t),time=Math.floor(Date.now()/600000)*600000,context=hash(views);
  let calls=0,selected={main:'rainviewer',overview:'same'};
  const provider={getHistory:async()=>[{time:time/1000}],getTile:async()=>{calls++;return png;}};
  const radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},{store,views,now:()=>time+300000,waitForSettle:()=>false,selection:()=>selected});
  await store.protect([{context,main:'rainviewer',overview:'rainviewer'}]);await radar.refresh();
  const next={main:'rainbow',overview:'same'};
  assert.equal((await radar.configure(next,async()=>{selected=next;})).status,200);
  await store.protect([{context,main:'rainbow',overview:'rainbow'}]);
  for(let i=0;i<10;i++)await store.maintain({space:{capacity:1024**3,available:0}});
  assert.equal(await store.lastGood({context,source:'rainviewer',role:'main'}),null);
  const before=calls,original={main:'rainviewer',overview:'same'};
  assert.equal((await radar.configure(original,async()=>{selected=original;})).status,200);
  assert.ok(calls>before,'a cached manifest must not hide missing retained files');
  assert.ok(radar.status().frames.some(frame=>frame.source==='rainviewer'&&frame.url));
  assert.equal(await radar.archive.window(time/1000,2),null);
});

test('source transition interpretation survives pruning and rejects incompatible map geometry',async t=>{
  const {store}=await fixture(t),time=Math.floor(Date.now()/600000)*600000,context=hash(views);
  await store.put([{kind:'transition',source:'selection',context,time:time-172800000,receivedAt:time,data:{main:'rainbow',overview:'rainviewer'}}]);
  await store.publish({kind:'radar',source:'rainbow',context,role:'main',time:time-600000,receivedAt:time,data:{}},png);
  await store.setRetention(1);
  const archive=await createRadarHistory(store,views,{now:()=>time+300000,selection:{main:'rainbow',overview:'rainviewer'}});
  assert.equal((await archive.window(time/1000-600,2)).frames[0].source,'rainbow');
  const other=await createRadarHistory(store,{...views,viewKey:'333333333333'},{now:()=>time+300000,selection:{main:'rainbow',overview:'rainviewer'}});
  assert.equal(await other.window(time/1000-600,2),null);
});

test('pressure during source commit preserves new Live, survives restart, and releases failed candidates',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-switch-pressure-')),time=Math.floor(Date.now()/600000)*600000,full={capacity:1024**3,available:0};
  let store=await createHistoryStore(dir,{now:time}),selected={main:'rainviewer',overview:'same'};
  t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  const provider={getHistory:async()=>[{time:time/1000}],getTile:async()=>png};
  const options=()=>({store,views,now:()=>time+300000,waitForSettle:()=>false,selection:()=>selected});
  let radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},options());
  await store.protect([radar.protection()]);await radar.refresh();await store.maintain({space:full});
  const next={main:'rainbow',overview:'same'};
  assert.equal((await radar.configure(next,async()=>{selected=next;await store.maintain({space:full});})).status,200);
  assert.equal(radar.status().frames[0].source,'rainbow');assert.ok(radar.status().frames[0].url);
  assert.equal(await radar.archive.window(time/1000,2),null,'held Live does not bypass Archive cutoff');
  await store.maintain({space:full});
  assert.equal(await store.lastGood({context:hash(views),source:'rainviewer',role:'main'}),null,'old source is no longer pinned');
  await store.close();store=await createHistoryStore(dir,{now:time});
  radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},options());
  assert.equal(radar.status().frames[0].source,'rainbow');
  assert.equal((await radar.configure({main:'rainviewer',overview:'same'},async()=>{await store.maintain({space:full});throw Error('Settings write failed');})).status,503);
  assert.equal(radar.status().frames[0].source,'rainbow');await store.maintain({space:full});
  assert.equal(await store.lastGood({context:hash(views),source:'rainviewer',role:'main'}),null,'failed candidate protection is released');
});

test('map replacement protects both views during pressure and releases the old map after commit',async t=>{
  const {dir,store}=await fixture(t),time=Math.floor(Date.now()/600000)*600000,full={capacity:1024**3,available:0};
  const provider={getHistory:async()=>[{time:time/1000}],getTile:async()=>png};let interleave=false;
  const maps=await createMapSettings(dir,{prepare:async()=>{},
    radarFactory:async(_directory,_provider,options)=>{
      const radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},{...options,store,now:()=>time+300000,waitForSettle:()=>false,selection:()=>({main:'rainviewer',overview:'same'})});
      const refresh=radar.refresh;radar.refresh=async()=>{await refresh();if(interleave)await store.maintain({space:full});};return radar;
    },protectRadar:radars=>store.protect(radars.map(radar=>radar.protection()))});
  await store.protect([maps.current().radar.protection()]);await maps.current().radar.refresh();await store.maintain({space:full});
  const oldContext=maps.current().radar.archive.context,next={...maps.current().settings,lat:51.5};interleave=true;
  assert.equal(maps.configure(next).status,202);
  for(let i=0;i<1000&&maps.status().busy;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(maps.status().busy,false);assert.equal(maps.status().error,null);assert.equal(maps.current().settings.lat,51.5);
  assert.ok(maps.current().radar.status().frames[0].url&&maps.current().radar.status().frames[0].overviewUrl);
  await store.maintain({space:full});
  assert.equal(await store.lastGood({context:oldContext,source:'rainviewer',role:'main'}),null);
  assert.ok(await store.lastGood({context:maps.current().radar.archive.context,source:'rainviewer',role:'main'}));
});

test('storage accounting includes configuration and maps and labels a young estimate as learning',async t=>{
  const {dir,store}=await fixture(t);await mkdir(join(dir,'maps'));await writeFile(join(dir,'maps','fixture.svg'),'abc');
  const status=createStorageStatus(store,dir);const s=await status.refresh();
  assert.equal(s.otherBytes,3);assert.equal(s.appUsedBytes,s.accountedBytes+3);assert.equal(s.estimateLearning,true);
});

for(const delay of [0,1])test(`SQLite incident accounting preserves the exact grace boundary (${delay}ms late)`,async t=>{
  const {store}=await fixture(t),start=Math.floor(Date.now()/600000)*600000-3600000,context=hash(views);let clock=start;
  const archive=await createRadarHistory(store,views,{now:()=>clock,selection:{main:'rainviewer',overview:'same'}});
  clock=start+1200000+delay;
  await store.publish({kind:'radar',source:'rainviewer',context,role:'main',time:start+600000,receivedAt:clock,data:{}},png);
  await archive.add([{arrivedAt:clock}]);
  assert.equal(archive.live().counts.main.gapsSeen,delay);assert.equal(archive.live().counts.main.lateArrivals,delay);
  assert.equal(archive.live().counts.overview.gapsSeen,1);
});

test('fresh archive clears weather content while preserving operational cooldowns',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'weather-sqlite-upgrade-')),time=Date.now(),location={lat:1,lon:2};
  await mkdir(join(dir,'settings'));await writeFile(join(dir,'settings','openweather.json'),JSON.stringify({apiKey:'a'.repeat(32)}));
  await writeFile(join(dir,'weather.json'),JSON.stringify({location:'1,2',nextAttemptAt:time+500000,nextSetupAt:time+20000,failures:1,error:'Retained warning',data:{current:{temperature:20},minutely:[]}}));
  const store=await createHistoryStore(dir);t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
  let calls=0;const weather=await createWeather(dir,{store,now:()=>time+300000,location,request:async()=>{calls++;throw Error('Should not poll');}});
  assert.equal(weather.status().data,null);assert.equal(weather.status().nextAttemptAt,time+500000);
  await weather.refresh();assert.equal(calls,0);
  for(let i=0;i<50&&(await store.status()).legacyPending;i++)await store.maintain();
  assert.equal((await store.status()).legacyPending,false);
  assert.equal((await readdir(dir)).includes('weather.json'),false);
  const restored=await createWeather(dir,{store,now:()=>time+300000,location});assert.equal(restored.status().nextAttemptAt,time+500000);
});

test('generation reset retains only last-good Live manifests without inventing recovered Archive rows',async t=>{
  const {store}=await fixture(t),time=Math.floor(Date.now()/600000)*600000,context=hash(views);let reset=false;
  for(const role of ['main','overview'])await store.publish({kind:'radar',context,source:'rainviewer',role,time,receivedAt:time,data:{}},png);
  const proxy={...store,status:async()=>({...await store.status(),generation:reset?'replacement':'original'}),range:q=>reset?Promise.resolve({records:[],next:null}):store.range(q),contextBefore:q=>reset?Promise.resolve(null):store.contextBefore(q)};
  const archive=await createRadarHistory(proxy,views,{now:()=>time+300000,selection:{main:'rainviewer',overview:'same'}});
  reset=true;await archive.reload();
  assert.equal(archive.live().frames.length,1);assert.ok(archive.live().frames[0].url&&archive.live().frames[0].overviewUrl);
  assert.equal(await archive.window(time/1000,2),null);
});
