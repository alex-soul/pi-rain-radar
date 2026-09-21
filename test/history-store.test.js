import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import {createHistoryStore} from '../src/history-store.js';
import {legacyOwned,reserveBytes} from '../src/history-files.js';

const now=Date.UTC(2026,8,20,12),day=86400000;
const png=await sharp({create:{width:32,height:32,channels:4,background:'#123'}}).png().toBuffer();
const observation=(time=now,extra={})=>({kind:'weather',source:'owm',context:'location-a',time,receivedAt:now,data:{tempC:12},...extra});
async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'radar-sqlite-test-'));let store;
  t.after(async()=>{await store?.close();await rm(directory,{recursive:true,force:true});});
  return {directory,async open(options={}){store=await createHistoryStore(directory,{now,...options});return store;},async close(){await store?.close();store=null;}};
}
const query=(extra={})=>({kind:'weather',source:'owm',context:'location-a',start:now-day,end:now,...extra});

test('structured history persists, bounded range pages and source context remain independent',async t=>{
  const f=await fixture(t);let a=await f.open();
  await a.put([observation(now-1000),observation(),observation(now,{source:'tempest'}),observation(now,{context:'location-b'})]);
  const p=await a.range(query({limit:1}));assert.equal(p.records.length,1);assert.ok(p.next);
  assert.equal((await a.range(query({after:p.next}))).records[0].time,now);
  assert.equal((await a.latest(query())).data.tempC,12);
  assert.equal((await a.status()).records,4);
  await f.close();a=await f.open();assert.equal((await a.range(query())).records.length,2);
  await assert.rejects(a.range(query({start:now-3*day})),{code:'ARCHIVE_INPUT'});
});

test('forecast first valid revision wins across concurrent arrivals and restarts',async t=>{
  const f=await fixture(t);let a=await f.open();const record=observation(now,{kind:'forecast',data:{points:[{time:now,rain:1},null]}});
  const outcomes=await Promise.all([a.put([record]),a.put([{...record,data:{points:[{time:now,rain:9},{time:now+60000,rain:2}]}}])]);
  assert.deepEqual(outcomes.map(x=>x.inserted),[1,0]);await f.close();a=await f.open();
  assert.deepEqual((await a.latest(query({kind:'forecast'}))).data,record.data);
  assert.equal((await a.put([record])).inserted,0);
});

test('media publication validates bytes and exposes only complete immutable images',async t=>{
  const f=await fixture(t),a=await f.open();
  const camera=observation(now,{kind:'camera',source:'direct',context:'camera-a',basis:'acquisition'});
  await assert.rejects(a.publish(camera,Buffer.from('broken')),{code:'ARCHIVE_IMAGE'});
  assert.equal((await a.status()).mediaBytes,0);
  const saved=await a.publish(camera,png);assert.equal(saved.inserted,1);
  assert.deepEqual(await readFile(join(f.directory,'archive',saved.asset)),png);
  assert.equal((await a.publish(camera,png)).inserted,0);
  assert.equal((await a.latest(query({kind:'camera',source:undefined,context:undefined}))).basis,'acquisition');
  assert.equal((await a.status()).mediaBytes,png.length);
});

test('shared retention cutoff removes all streams and survives reopen',async t=>{
  const f=await fixture(t);let a=await f.open();
  for(const kind of ['weather','forecast','incident','transition','settling'])await a.put([observation(now-2*day,{kind}),observation(now,{kind})]);
  await a.publish(observation(now-2*day,{kind:'camera',basis:'metadata'}),png);
  const saved=await a.publish(observation(now,{kind:'camera',basis:'metadata'}),png);
  let cleanup=await a.setRetention(1);const status=await a.status();assert.equal(status.cutoff,now-day);assert.equal(status.records,6);
  for(let i=0;i<10&&cleanup.cleanupPending;i++)cleanup=await a.maintain();
  assert.equal(cleanup.cleanupPending,false);assert.equal((await a.status()).mediaBytes,png.length);
  await f.close();a=await f.open();assert.equal((await a.status()).retentionDays,1);
  assert.deepEqual(await readFile(join(f.directory,'archive',saved.asset)),png);
  await a.setRetention(null);assert.equal((await a.status()).cutoff,now-day);
  await assert.rejects(a.setRetention(.5),{code:'ARCHIVE_INPUT'});
});

test('last-good current-role radar survives expiry while other contexts roll away',async t=>{
  const f=await fixture(t),a=await f.open();
  await a.protect([{context:'map-a',main:'rainviewer',overview:'rainviewer'}]);
  for(const role of ['main','overview'])await a.publish(observation(now-9*day,{kind:'radar',context:'map-a',source:'rainviewer',role}),png);
  await a.publish(observation(now-10*day,{kind:'radar',context:'map-b',source:'rainviewer',role:'main'}),png);
  await a.put([observation(now-8*day)]);
  await a.maintain();assert.equal((await a.status()).records,2);
  assert.equal((await a.status()).cutoff,now-7*day);
  assert.equal((await a.range(query({kind:'radar',source:'rainviewer',context:'map-a',start:now-9*day,end:now-8*day}))).records.length,0);
  assert.equal((await a.lastGood({context:'map-a',source:'rainviewer',role:'main'})).time,now-9*day);
});

test('legacy reset is targeted, preserves credentials, budgets and unrelated files, and runs only once',async t=>{
  const f=await fixture(t);await mkdir(join(f.directory,'settings'));
  const settings='{"apiKey":"synthetic-only","quota":55}';await writeFile(join(f.directory,'settings','rainbow-usage.json'),settings);
  await writeFile(join(f.directory,'weather.json'),JSON.stringify({data:{current:{temp:19}},nextAttemptAt:now+60000,nextSetupAt:now+20000,failures:2}));
  await writeFile(join(f.directory,'observations-123456abcdef.json'),'old history');await writeFile(join(f.directory,'999-123456abcdef.png'),png);
  await writeFile(join(f.directory,'my-photo.png'),png);await writeFile(join(f.directory,'unrelated.json'),'keep');
  let a=await f.open();assert.equal((await a.status()).records,0);await a.maintain();
  for(let i=0;i<50&&(await a.status()).legacyPending;i++)await a.maintain();
  assert.equal((await a.status()).legacyPending,false);
  assert.equal(await readFile(join(f.directory,'settings','rainbow-usage.json'),'utf8'),settings);
  const state=JSON.parse(await readFile(join(f.directory,'settings','weather-operational.json')));assert.equal(state.nextAttemptAt,now+60000);assert.equal(state.data,undefined);
  assert.equal((await readdir(f.directory)).includes('observations-123456abcdef.json'),false);
  assert.deepEqual(await readFile(join(f.directory,'my-photo.png')),png);
  await a.put([observation()]);
  await f.close();
  await writeFile(join(f.directory,'999-123456abcdef.png'),png);a=await f.open();await a.maintain();
  assert.equal((await a.status()).records,1);assert.deepEqual(await readFile(join(f.directory,'999-123456abcdef.png')),png);
});

test('unknown schema and missing database refuse reset, retaining evidence',async t=>{
  const f=await fixture(t);await f.open();await f.close();const path=join(f.directory,'archive','history.sqlite');
  const healthy=await readFile(path);
  const db=new DatabaseSync(path);db.exec('PRAGMA user_version=99');db.close();
  await assert.rejects(f.open(),{code:'ARCHIVE_SCHEMA'});
  const bytes=await readFile(path);assert.ok(bytes.length>0);
  await rm(path);
  for(let i=0;i<5;i++)await assert.rejects(f.open(),{code:'ARCHIVE_STATE'});
  await writeFile(path,healthy);assert.equal((await (await f.open()).status()).records,0);
});

test('confirmed corruption preserves failed database and media, resets history once and blocks loops',async t=>{
  const f=await fixture(t);let a=await f.open();const saved=await a.publish(observation(now,{kind:'camera',basis:'metadata'}),png);await f.close();
  const path=join(f.directory,'archive','history.sqlite'),broken=Buffer.from('confirmed damaged SQLite header');await writeFile(path,broken);
  a=await f.open();let s=await a.status();assert.equal(s.records,0);assert.equal(s.recoveryCount,1);assert.equal(s.recoveryBlocked,true);
  const dirs=await readdir(join(f.directory,'archive','recovery'));assert.deepEqual(await readFile(join(f.directory,'archive','recovery',dirs[0],'history.sqlite')),broken);
  assert.deepEqual(await readFile(join(f.directory,'archive',saved.asset)),png);
  await a.put([observation()]);await f.close();await writeFile(path,broken);
  await assert.rejects(f.open(),{code:'ARCHIVE_RECOVERY'});assert.equal((await readdir(join(f.directory,'archive','recovery'))).length,1);
});

test('SQLite BUSY does not trigger corruption recovery or reset records',async t=>{
  const f=await fixture(t),a=await f.open();await a.put([observation()]);
  const db=new DatabaseSync(join(f.directory,'archive','history.sqlite'));db.exec('BEGIN IMMEDIATE');
  try{await assert.rejects(a.put([observation(now-1000)]));}finally{db.exec('ROLLBACK');db.close();}
  assert.equal((await a.status()).recoveryCount,0);assert.equal((await a.status()).records,1);
});

test('interrupted image publication is reclaimed without exposing a record',async t=>{
  const f=await fixture(t);let a=await f.open();await f.close();
  const db=new DatabaseSync(join(f.directory,'archive','history.sqlite'));db.prepare('INSERT INTO assets VALUES(?,?,?,?,?)').run('interrupted','media/orphan.png',3,now,'staged');db.close();
  await mkdir(join(f.directory,'archive','media'),{recursive:true});await writeFile(join(f.directory,'archive','media','orphan.png.tmp'),'abc');
  a=await f.open();assert.equal((await a.status()).mediaBytes,3);
  // A slow durable transaction may deliberately defer file I/O to the next
  // maintenance turn. Verify eventual reclamation without defeating that budget.
  for(let i=0;i<20&&(await a.status()).mediaBytes;i++)await a.maintain();
  assert.equal((await a.status()).mediaBytes,0);
  await assert.rejects(stat(join(f.directory,'archive','media','orphan.png.tmp')),{code:'ENOENT'});
});

test('cleanup batches are bounded while the common cutoff hides every expired stream immediately',async t=>{
  const f=await fixture(t),a=await f.open();
  for(let batch=0;batch<3;batch++)await a.put(Array.from({length:128},(_,i)=>observation(now-2*day-batch*128-i)));
  const result=await a.setRetention(1);assert.equal(result.recordsRemoved,128);assert.equal((await a.status()).records,256);
  assert.equal((await a.range(query({start:now-2*day-1000,end:now-day}))).records.length,0);
  for(let i=0;i<50&&(await a.status()).records;i++){const turn=await a.maintain();assert.ok(turn.recordsRemoved<=128);}
  assert.equal((await a.status()).records,0);
});

test('range query uses indexes, not a full-history scan; inputs and payloads are bounded',async t=>{
  const f=await fixture(t),a=await f.open();
  await assert.rejects(a.put(Array.from({length:129},()=>observation())),{code:'ARCHIVE_INPUT'});
  await assert.rejects(a.put([observation(now,{data:{text:'x'.repeat(129*1024)}})]),{code:'ARCHIVE_INPUT'});
  const db=new DatabaseSync(join(f.directory,'archive','history.sqlite'));
  const plans=db.prepare('EXPLAIN QUERY PLAN SELECT * FROM records WHERE kind=? AND context=? AND time>=? AND time<=? ORDER BY time,id LIMIT 128').all('weather','location-a',0,now);
  assert.ok(plans.some(p=>p.detail.includes('SEARCH')&&p.detail.includes('records_range')));db.close();
  assert.equal(legacyOwned('credentials.json'),false);assert.equal(legacyOwned('history-rainviewer-123456abcdef.json'),true);
  assert.ok(reserveBytes(64*1024**3)>=64*1024**2);
});

const full={capacity:1024**3,available:0};
test('pressure overrides unlimited retention with one cutoff, retaining final radar roles',async t=>{
  const f=await fixture(t),a=await f.open();await a.setRetention(null);
  for(const offset of [600000,0]){
    for(const role of ['main','overview'])await a.publish(observation(now-offset,{kind:'radar',source:'rainviewer',context:'map',role}),png);
    await a.put([observation(now-offset)]);
  }
  const result=await a.maintain({space:full});assert.equal(result.pressure,true);
  assert.equal((await a.status()).records,3);assert.equal((await a.range(query())).records.length,1);
  await a.maintain({space:full});assert.equal((await a.status()).records,2);
  let blocked=await a.maintain({space:full});
  for(let i=0;i<10&&!blocked.blocked;i++)blocked=await a.maintain({space:full});
  assert.equal(blocked.blocked,'ARCHIVE_FULL');assert.equal((await a.status()).records,2);
  assert.equal((await a.range(query())).records.length,0);
  assert.equal((await a.status()).retentionDays,null);
});

test('failed unlink stays accounted and can retry without erasing last-good playback',async t=>{
  const f=await fixture(t),a=await f.open();
  const saved=await a.publish(observation(now-2*day,{kind:'camera',basis:'metadata'}),png);
  const path=join(f.directory,'archive',saved.asset);await rm(path);await mkdir(path);
  let result=await a.setRetention(1);
  // Slow metadata commits may yield before attempting the physical unlink.
  for(let i=0;i<5&&!result.blocked;i++)result=await a.maintain();
  assert.equal(result.blocked,'ARCHIVE_PATH');
  assert.equal((await a.status()).mediaBytes,png.length);assert.equal((await a.range(query({kind:'camera',context:undefined,source:undefined}))).records.length,0);
  await rm(path,{recursive:true});await a.maintain();assert.equal((await a.status()).mediaBytes,0);
});

test('media cleanup yields with pending work and drains without losing accounting',async t=>{
  const f=await fixture(t),a=await f.open();await a.setRetention(null);
  for(let i=0;i<40;i++)await a.publish(observation(now-2*day+i,{kind:'camera',basis:'metadata'}),png);
  const first=await a.setRetention(1);
  assert.equal(first.cleanupPending,true);assert.ok(first.assetsRemoved<=8);
  assert.equal((await a.status()).records,0);
  assert.ok((await a.status()).mediaBytes>0,'pending files remain accounted');
  let result=first,turns=0;
  while(result.cleanupPending&&turns++<50){
    // Foreground reads can interleave with each bounded cleanup turn.
    assert.equal((await a.range(query())).records.length,0);
    result=await a.maintain();assert.ok(result.assetsRemoved<=8);
  }
  assert.equal(result.cleanupPending,false);assert.equal((await a.status()).mediaBytes,0);
});

test('interrupted cleanup conservatively reserves recovery media until the remaining files drain',async t=>{
  const f=await fixture(t);let a=await f.open();await a.setRetention(null);
  for(let i=0;i<12;i++)await a.publish(observation(now-2*day+i,{kind:'camera',basis:'metadata'}),png);
  const first=await a.setRetention(1);assert.equal(first.cleanupPending,true);
  const before=await a.status(),marker=JSON.parse(await readFile(join(f.directory,'archive','state.json')));
  assert.ok(marker.mediaBytes>=before.mediaBytes);
  await f.close();await writeFile(join(f.directory,'archive','history.sqlite'),'damaged header');
  a=await f.open();assert.equal((await a.status()).recoveryMediaBytes,marker.mediaBytes);
  for(let i=0;i<30&&(await a.status()).recoveryMediaBytes;i++)await a.maintain({space:full});
  assert.equal((await a.status()).recoveryMediaBytes,0);
  assert.ok((await a.status()).recoveryDatabaseBytes>0);
});

test('pressure reclaims failed-archive media before current data and keeps recovery DB evidence',async t=>{
  const f=await fixture(t);let a=await f.open();await a.setRetention(null);
  const old=await a.publish(observation(now-600000,{kind:'camera',basis:'metadata'}),png);await f.close();
  await writeFile(join(f.directory,'archive','history.sqlite'),'damaged header');a=await f.open();
  assert.equal((await a.status()).retentionDays,null);
  assert.equal((await a.status()).recoveryMediaBytes,png.length);
  const current=await a.publish(observation(now,{kind:'camera',basis:'metadata'}),png);
  await a.maintain({space:full});await assert.rejects(stat(join(f.directory,'archive',old.asset)),{code:'ENOENT'});
  assert.deepEqual(await readFile(join(f.directory,'archive',current.asset)),png);
  assert.ok((await a.status()).recoveryDatabaseBytes>0);
});

test('interrupted recovery resumes sidecar preservation without moving the replacement',async t=>{
  const f=await fixture(t);let a=await f.open();await a.put([observation()]);await f.close();
  const root=join(f.directory,'archive'),path=join(root,'state.json'),state=JSON.parse(await readFile(path));
  state.pendingRecovery={id:'12345678-1234-1234-1234-123456789abc',generation:state.generation,at:now,firstTime:null,lastTime:null,mediaBytes:0};state.recoveryBlocked=true;
  await mkdir(join(root,'recovery',state.pendingRecovery.id),{recursive:true});
  const {rename}=await import('node:fs/promises');await rename(join(root,'history.sqlite'),join(root,'recovery',state.pendingRecovery.id,'history.sqlite'));
  await writeFile(path,JSON.stringify(state));a=await f.open();assert.equal((await a.status()).records,0);assert.equal((await a.status()).recoveryCount,1);
  await f.close();a=await f.open();assert.equal((await a.status()).recoveryCount,1);
});

test('initialization can resume and normal restart never repeats a fresh archive',async t=>{
  const f=await fixture(t);let a=await f.open();await a.put([observation()]);await f.close();
  const path=join(f.directory,'archive','state.json'),state=JSON.parse(await readFile(path));state.phase='initializing';await writeFile(path,JSON.stringify(state));
  a=await f.open();assert.equal((await a.status()).records,1);
});

test('request admission is bounded with explicit backpressure and no silent accepted-write loss',async t=>{
  const f=await fixture(t),a=await f.open();
  const calls=Array.from({length:90},(_,i)=>a.put([observation(now-i)]));
  const outcomes=await Promise.allSettled(calls),accepted=outcomes.filter(o=>o.status==='fulfilled');
  assert.equal(accepted.length,64);assert.ok(outcomes.filter(o=>o.status==='rejected').every(o=>o.reason.code==='ARCHIVE_BUSY'));
  assert.equal((await a.status()).records,64);
  await assert.rejects(createHistoryStore(f.directory),{code:'ARCHIVE_OPEN'});
});

test('retention preserves only the last transition needed to interpret its boundary',async t=>{
  const f=await fixture(t),a=await f.open();
  await a.put([observation(now-3*day,{kind:'transition',data:{main:'rainviewer'}}),observation(now-2*day,{kind:'transition',data:{main:'rainbow'}})]);
  await a.setRetention(1);assert.equal((await a.status()).records,0);
  assert.equal((await a.boundary({source:'owm',context:'location-a'})).data.main,'rainbow');
  assert.equal((await a.range(query({kind:'transition'}))).records.length,0);
});

test('failed image write leaves no visible record and does not trigger a fresh database',async t=>{
  const f=await fixture(t),a=await f.open();const state=await a.status();
  const parent=join(f.directory,'archive','media',state.generation);await mkdir(parent,{recursive:true});
  await writeFile(join(parent,String(Math.floor(now/3600000))),'not a directory');
  await assert.rejects(a.publish(observation(now,{kind:'camera',basis:'metadata'}),png));
  assert.equal((await a.status()).records,0);assert.equal((await a.status()).recoveryCount,0);
  assert.equal((await a.status()).mediaBytes,png.length);
});

test('inline module callers can open workers; a second process cannot claim an active archive',async t=>{
  const f=await fixture(t);
  const moduleUrl=new URL('../src/history-store.js',import.meta.url).href;
  const run=code=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',code,f.directory],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
    child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.once('error',reject);child.once('exit',code=>resolve({code,output}));
  });
  let result=await run(`import {createHistoryStore} from ${JSON.stringify(moduleUrl)}; const a=await createHistoryStore(process.argv[1]); await a.close();`);
  assert.equal(result.code,0,result.output);
  await f.open();result=await run(`import assert from 'node:assert/strict'; import {createHistoryStore} from ${JSON.stringify(moduleUrl)}; await assert.rejects(createHistoryStore(process.argv[1]),{code:'ARCHIVE_OPEN'});`);
  assert.equal(result.code,0,result.output);
});

test('failed database recovery preserves accompanying WAL evidence',async t=>{
  const f=await fixture(t);await f.open();await f.close();
  const root=join(f.directory,'archive'),file=join(root,'history.sqlite'),wal=Buffer.from('synthetic WAL evidence');
  await writeFile(file,'invalid database header');await writeFile(file+'-wal',wal);
  const a=await f.open();assert.equal((await a.status()).recoveryCount,1);
  const [id]=await readdir(join(root,'recovery'));
  assert.deepEqual(await readFile(join(root,'recovery',id,'history.sqlite-wal')),wal);
});
