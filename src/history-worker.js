import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {join,dirname} from 'node:path';
import {mkdir,open,rename,rmdir,copyFile,unlink} from 'node:fs/promises';
import sharp from 'sharp';
import {APPLICATION_ID,SCHEMA_VERSION,kinds,schema} from './history-schema.js';
import {archiveError,exists,readJson,atomicJson,syncDirectory,ownedPath,regularFile,diskSpace,reserveBytes,preserveWeather,legacyFiles,mediaFiles,removeFile,acquireLease,releaseLease} from './history-files.js';

const {directory,options,leaseToken}=workerData;
const root=join(directory,'archive'),file=join(root,'history.sqlite'),markerFile=join(root,'state.json');
const clock=()=>options.now ?? Date.now(); // deterministic fixture clock; production omits it
const BATCH=128,MiB=1024*1024,DAY=86400000,MAX_SPAN=28*3600000;
let db,marker,legacyIterator,closed=false,storageError=null,protectedContexts=[];
let cleanupBatch=BATCH,lastCheckpoint=-Infinity;
const recoveryIterators=new Map();
function meta(key,value) {
  const previous=db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;
  if(value!==undefined){
    const encoded=JSON.stringify(value);
    // Unchanged operational state must not cause another FULL-synchronous
    // transaction on every maintenance/status turn, especially on SD cards.
    if(encoded!==previous)db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,encoded);
    return value;
  }
  return JSON.parse(previous??'null');
}
function tx(fn) {db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}}
function validTime(t){return Number.isSafeInteger(t)&&t>=0&&t<=8640000000000000;}
function text(t){return typeof t==='string'&&t.length>0&&t.length<=256&&!/[\x00-\x1f]/.test(t);}
function validate(record){
  if(!record||!kinds.includes(record.kind)||!text(record.source)||!text(record.context)||!validTime(record.time)||!validTime(record.receivedAt)||record.time>clock()+300000)
    throw archiveError('ARCHIVE_INPUT','Invalid history record');
  const role=record.role??'';
  if(!['','main','overview'].includes(role)||(record.kind==='radar'&&!role))throw archiveError('ARCHIVE_INPUT','Invalid history role');
  if(record.kind==='camera'&&!['metadata','acquisition'].includes(record.basis))throw archiveError('ARCHIVE_INPUT','Invalid camera timestamp basis');
  const data=JSON.stringify(record.data??{});
  if(data===undefined||Buffer.byteLength(data)>128*1024)throw archiveError('ARCHIVE_INPUT','History payload too large');
  return {...record,role,data};
}
function duplicate(r){return db.prepare('SELECT id FROM records WHERE kind=? AND source=? AND context=? AND role=? AND time=?').get(r.kind,r.source,r.context,r.role,r.time);}
function insert(r,asset=null){
  // Historical revisions are immutable. Incident/settling updates have explicit
  // mutable bookkeeping semantics and never replace a forecast or image.
  const conflict=['incident','settling'].includes(r.kind)?'DO UPDATE SET data=excluded.data,received_at=excluded.received_at':'DO NOTHING';
  return Number(db.prepare(`INSERT INTO records(kind,source,context,role,time,received_at,basis,data,asset) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(kind,source,context,role,time) ${conflict}`)
    .run(r.kind,r.source,r.context,r.role,r.time,r.receivedAt,r.basis??null,r.data,asset).changes);
}
function publicRecord(r){return r?{id:r.id,kind:r.kind,source:r.source,context:r.context,role:r.role,time:r.time,receivedAt:r.received_at,basis:r.basis,data:JSON.parse(r.data),asset:r.path??null}:null;}
function openDatabase(){
  db=new DatabaseSync(file,{timeout:100,enableForeignKeyConstraints:true,allowExtension:false});
  const version=db.prepare('PRAGMA user_version').get().user_version;
  const application=db.prepare('PRAGMA application_id').get().application_id;
  if(version!==0&&(version!==SCHEMA_VERSION||application!==APPLICATION_ID))throw archiveError('ARCHIVE_SCHEMA','Unsupported archive schema; preserve data and use compatible software');
  if(version===0){
    if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").get())throw archiveError('ARCHIVE_SCHEMA','Unknown unversioned archive');
    if(marker.phase==='ready')throw archiveError('ARCHIVE_STATE','Archive unexpectedly empty; manual recovery required');
    db.exec('PRAGMA auto_vacuum=INCREMENTAL');
    tx(()=>{db.exec(schema);db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION}`);meta('retentionDays',Object.hasOwn(marker,'retentionDays')?marker.retentionDays:7);meta('cutoff',0);meta('generation',marker.generation);meta('lastWrite',0);meta('recoveryCheckpoint',false);});
  }
  if(meta('generation')!==marker.generation)throw archiveError('ARCHIVE_STATE','Archive generation does not match state');
  meta('retentionDays',marker.retentionDays);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-8192; PRAGMA wal_autocheckpoint=1000; PRAGMA journal_size_limit=16777216');
  const sqlite=db.prepare('SELECT sqlite_version() AS version').get().version.split('.').map(Number);
  if(sqlite[0]<3||(sqlite[0]===3&&(sqlite[1]<51||(sqlite[1]===51&&sqlite[2]<3))))throw archiveError('ARCHIVE_SCHEMA','SQLite 3.51.3 or newer required');
}
const corrupt=e=>e?.code==='ERR_SQLITE_ERROR'&&[11,26].includes((e.errcode??0)&255);
async function finishRecovery(){
  const pending=marker.pendingRecovery;if(!pending)return;
  const dest=join(root,'recovery',pending.id);await mkdir(dest,{recursive:true,mode:0o700});
  for(const suffix of ['','-wal','-shm','-journal']){
    const from=file+suffix,to=join(dest,'history.sqlite'+suffix);
    if(await exists(from)){
      if(await exists(to)){
        // Sidecars were copied while the sole connection was quiescent, before
        // SQLite close could checkpoint/remove them. The preserved copy wins.
        if(!suffix)throw archiveError('ARCHIVE_RECOVERY','Recovery destination already exists');
        await unlink(from);
      }else await rename(from,to);
    }
  }
  await syncDirectory(root);await syncDirectory(dest);
  marker.recoveries.push(pending);marker.generation=randomUUID();marker.firstTime=null;marker.lastTime=null;marker.mediaBytes=0;
  marker.pendingRecovery=null;marker.phase='initializing';await atomicJson(markerFile,marker);
}
async function recover(){
  if(marker.phase!=='ready'||marker.recoveryBlocked||marker.recoveries.length>=32)
    throw archiveError('ARCHIVE_RECOVERY','Archive recovery requires manual attention; evidence preserved');
  marker.recoveryBlocked=true;
  marker.pendingRecovery={id:randomUUID(),generation:marker.generation,at:clock(),firstTime:marker.firstTime,lastTime:marker.lastTime,mediaBytes:marker.mediaBytes??0};
  if(db){
    const sidecars=[];let required=0;
    for(const suffix of ['-wal','-shm','-journal'])if(await exists(file+suffix)){required+=(await regularFile(file+suffix)).size;sidecars.push(suffix);}
    if((await space()).available<required+MiB)throw archiveError('ARCHIVE_RECOVERY','Insufficient space to preserve recovery sidecars; recording stopped');
    await atomicJson(markerFile,marker);
    const dest=join(root,'recovery',marker.pendingRecovery.id);await mkdir(dest,{recursive:true,mode:0o700});
    for(const suffix of sidecars){
      const target=join(dest,'history.sqlite'+suffix);await copyFile(file+suffix,target+'.tmp');
      const handle=await open(target+'.tmp','r');try{await handle.sync();}finally{await handle.close();}
      await rename(target+'.tmp',target);
    }
    await syncDirectory(dest);
    db.close();db=null;
  }else await atomicJson(markerFile,marker);
  await finishRecovery();openDatabase();
  marker.phase='ready';await atomicJson(markerFile,marker);
  storageError='Archive database recovered; earlier images are preserved only while space permits';
}
async function initialize(){
  await mkdir(root,{recursive:true,mode:0o700});
  // Reject a symlinked owned root rather than following it into unrelated data.
  const {lstat}=await import('node:fs/promises');
  if((await lstat(root)).isSymbolicLink())throw archiveError('ARCHIVE_PATH','Archive root must not be a symlink');
  await acquireLease(root,leaseToken);
  if(await exists(markerFile)){
    marker=await readJson(markerFile);
    const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
    const validRecovery=r=>r&&uuid(r.id)&&uuid(r.generation)&&validTime(r.at)&&(r.firstTime===null||validTime(r.firstTime))&&(r.lastTime===null||validTime(r.lastTime))&&((r.firstTime===null&&r.lastTime===null)||r.lastTime>=r.firstTime);
    if(marker.version!==1||!['initializing','ready'].includes(marker.phase)||!Array.isArray(marker.recoveries)||marker.recoveries.length>32||!uuid(marker.generation)||!marker.recoveries.every(validRecovery)||(marker.pendingRecovery&&!validRecovery(marker.pendingRecovery))||!(marker.retentionDays===null||(Number.isSafeInteger(marker.retentionDays)&&marker.retentionDays>=1)))throw archiveError('ARCHIVE_STATE','Invalid archive state; preserve for recovery');
  }else{
    if(await exists(file))throw archiveError('ARCHIVE_STATE','Unmanaged database requires manual inspection');
    await preserveWeather(directory);
    marker={version:1,phase:'initializing',generation:randomUUID(),legacyPending:true,retentionDays:7,recoveries:[],recoveryBlocked:false,firstTime:null,lastTime:null,mediaBytes:0};
    await atomicJson(markerFile,marker);
  }
  await finishRecovery();
  if(marker.phase==='ready'&&!await exists(file))throw archiveError('ARCHIVE_STATE','Archive database missing; automatic reset refused');
  if(marker.phase==='ready'){
    // Diagnose an invalid owned header before SQLite can discard an invalid WAL
    // on opening it. No corpus scan or full integrity check on normal startup.
    const handle=await open(file,'r'),header=Buffer.alloc(16);
    let count;try{count=(await handle.read(header,0,16,0)).bytesRead;}finally{await handle.close();}
    if(count!==16||header.toString('binary')!=='SQLite format 3\0')await recover();
  }
  try{if(!db)openDatabase();}catch(error){if(corrupt(error))await recover();else throw error;}
  marker.phase='ready';await atomicJson(markerFile,marker);
  protectedContexts=meta('protectedContexts')??[];
}
function where(query,maxSpan=MAX_SPAN){
  const {kind,source,context,start,end}=query;
  if(!kinds.includes(kind)||!validTime(start)||!validTime(end)||end<start||end-start>maxSpan||end>clock()+300000)throw archiveError('ARCHIVE_INPUT','Invalid bounded history range');
  if(kind!=='camera'&&!text(context))throw archiveError('ARCHIVE_INPUT','History context required');
  const clauses=['r.kind=?','r.time>=?','r.time<=?'],params=[kind,Math.max(start,meta('cutoff')),end];
  if(context!==undefined){if(!text(context))throw archiveError('ARCHIVE_INPUT','Invalid context');clauses.push('r.context=?');params.push(context);}
  if(source!==undefined){if(!text(source))throw archiveError('ARCHIVE_INPUT','Invalid source');clauses.push('r.source=?');params.push(source);}
  if(query.role!==undefined){if(!['','main','overview'].includes(query.role))throw archiveError('ARCHIVE_INPUT','Invalid role');clauses.push('r.role=?');params.push(query.role);}
  return {clauses,params};
}
function queryRange(query,latest=false){
  const {clauses,params}=where(query);
  let limit=latest?1:(query.limit??128);
  if(!Number.isInteger(limit)||limit<1||limit>256)throw archiveError('ARCHIVE_INPUT','Invalid page size');
  if(query.after){const {time,id}=query.after;if(!validTime(time)||!Number.isSafeInteger(id)||id<1)throw archiveError('ARCHIVE_INPUT','Invalid cursor');clauses.push('(r.time,r.id)>(?,?)');params.push(time,id);}
  const statement=db.prepare(`SELECT r.*,a.path FROM records r LEFT JOIN assets a ON a.id=r.asset WHERE ${clauses.join(' AND ')} AND (r.asset IS NULL OR a.state='ready') ORDER BY r.time ${latest?'DESC':'ASC'},r.id ${latest?'DESC':'ASC'} LIMIT ?`);
  if(latest)return publicRecord(statement.get(...params,1));
  // Iterate rather than all(): even 256 large payloads must not transiently
  // allocate an entire oversized page before applying its byte limit.
  const page=[];let bytes=0,more=false;
  for(const row of statement.iterate(...params,limit+1)){
    const item=publicRecord(row),size=Buffer.byteLength(JSON.stringify(item));
    if(page.length>=limit||(page.length&&bytes+size>512*1024)){more=true;break;}
    page.push(item);bytes+=size;
  }
  const last=page.at(-1);return {records:page,next:more&&last?{time:last.time,id:last.id}:null};
}
async function space(){return diskSpace(root);}
async function writable(bytes=0){
  let s=await space();
  if(s.available<reserveBytes(s.capacity)+bytes){await maintain({space:s});s=await space();}
  if(s.available<reserveBytes(s.capacity)+bytes)throw archiveError('ARCHIVE_FULL','Storage reserve reached; prune before recording');
}
async function publish({record,bytes}){
  const r=validate(record);
  if(!['radar','cloud','camera'].includes(r.kind)||!(bytes instanceof Uint8Array)||bytes.length>8*MiB||bytes.length===0)throw archiveError('ARCHIVE_INPUT','Invalid image publication');
  if(duplicate(r))return {inserted:0};
  if(r.time<meta('cutoff')){
    const previous=r.kind==='radar'?lastGood(r):null;
    // A new current radar observation may improve Live even when pressure has
    // rolled Archive past its provider timestamp. Never re-import old backfill.
    if(r.kind!=='radar'||r.time<clock()-10800000||(previous&&r.time<=previous.time))return {inserted:0,expired:true};
  }
  await writable(bytes.length);
  let image;
  try{image=sharp(Buffer.from(bytes),{limitInputPixels:16000000,failOn:'warning'});const info=await image.metadata();if(!['png','jpeg','webp'].includes(info.format)||info.pages>1)throw Error();await image.stats();r.extension=info.format==='jpeg'?'jpg':info.format;}
  catch{throw archiveError('ARCHIVE_IMAGE','Invalid or oversized archive image');}
  const id=randomUUID(),path=`media/${marker.generation}/${Math.floor(r.time/3600000)}/${r.time}-${id}.${r.extension}`;
  const full=ownedPath(root,path);
  // Record time bounds before creating any file: recovery can find orphan media
  // without reading a corrupt DB or recursively scanning the entire archive.
  marker.firstTime=Math.min(marker.firstTime??r.time,r.time);marker.lastTime=Math.max(marker.lastTime??r.time,r.time);
  marker.mediaBytes=(marker.mediaBytes??0)+bytes.length;await atomicJson(markerFile,marker);
  tx(()=>db.prepare("INSERT INTO assets VALUES(?,?,?,?,'staged')").run(id,path,bytes.length,r.time));
  await mkdir(dirname(full),{recursive:true,mode:0o700});
  const handle=await open(full+'.tmp','wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  await rename(full+'.tmp',full);await syncDirectory(dirname(full));
  tx(()=>{db.prepare("UPDATE assets SET state='ready' WHERE id=?").run(id);insert(r,id);meta('lastWrite',clock());});
  return {inserted:1,asset:path};
}
async function cleanupAssets(){
  const removed=[],started=performance.now();
  // File I/O is far slower than deleting metadata. Bound it separately, and
  // commit completed unlinks together; crash retries tolerate absent files.
  const rows=db.prepare("SELECT * FROM assets WHERE state IN ('staged','delete') ORDER BY state,time,id LIMIT 4").all();
  for(const a of rows){
    const full=ownedPath(root,a.path);
    try{await removeFile(full+'.tmp');await removeFile(full);removed.push(a.id);
      // Remove only this now-empty shard, never recursively remove a media tree.
      try{await rmdir(dirname(full));}catch(e){if(!['ENOTEMPTY','EEXIST','ENOENT'].includes(e.code))storageError=e.code;}
    }
    catch(e){storageError=e.code??'ARCHIVE_IO';break;}
    if(performance.now()-started>=3)break;
  }
  if(removed.length)tx(()=>{const remove=db.prepare('DELETE FROM assets WHERE id=?');for(const id of removed)remove.run(id);});
  // This marker is only a conservative recovery reservation. SQLite totals
  // remain authoritative while healthy. Persist downward reconciliation when
  // cleanup drains instead of adding two fsyncs to every few file deletions.
  // A crash mid-cleanup can overestimate recovery bytes, never underestimate
  // an accepted publication (which still reserves durably before writing).
  const mediaBytes=db.prepare("SELECT value FROM totals WHERE key='mediaBytes'").get().value;
  if(marker.mediaBytes!==mediaBytes&&!db.prepare("SELECT 1 FROM assets WHERE state IN ('staged','delete') LIMIT 1").get()){
    marker.mediaBytes=mediaBytes;await atomicJson(markerFile,marker);
  }
  return removed.length;
}
function lastGood({context,source,role}){
  if(!text(context)||!text(source)||!['main','overview'].includes(role))throw archiveError('ARCHIVE_INPUT','Invalid Live fallback lookup');
  return publicRecord(db.prepare("SELECT r.*,a.path FROM records r JOIN assets a ON a.id=r.asset AND a.state='ready' WHERE r.kind='radar' AND r.context=? AND r.source=? AND r.role=? AND r.time<=? ORDER BY r.time DESC LIMIT 1").get(context,source,role,clock()));
}
function protectedRecords(){
  const result=[];
  for(const c of protectedContexts)for(const role of ['main','overview']){
    const r=lastGood({context:c.context,source:c[role],role});
    if(r)result.push(r.id);
  }
  if(!protectedContexts.length)for(const role of ['main','overview']){
    const r=db.prepare("SELECT id FROM records WHERE kind='radar' AND role=? AND time<=? ORDER BY time DESC LIMIT 1").get(role,clock());
    if(r)result.push(r.id);
  }
  return result;
}
async function reclaimRecovery(pressure){
  // Visit one preserved generation at a time, oldest first. File enumeration is
  // bounded each turn and never occurs on normal startup or history queries.
  let inspected=0,removed=0;const started=performance.now();
  for(const recovery of marker.recoveries){
    if(recovery.mediaReclaimed)continue;
    let iterator=recoveryIterators.get(recovery.id);
    if(!iterator){iterator=mediaFiles(root,recovery.generation,recovery.firstTime,recovery.lastTime);recoveryIterators.set(recovery.id,iterator);}
    while(inspected++<BATCH){
      const next=await iterator.next();
      if(next.done){recovery.mediaReclaimed=true;recovery.mediaBytes=0;recoveryIterators.delete(recovery.id);await atomicJson(markerFile,marker);break;}
      if(next.value&&pressure){try{const bytes=(await regularFile(next.value)).size;await removeFile(next.value);recovery.mediaBytes=Math.max(0,(recovery.mediaBytes??0)-bytes);await atomicJson(markerFile,marker);removed++;}catch(e){storageError=e.code;await iterator.return();recoveryIterators.delete(recovery.id);return {removed,pending:true};}}
      if(removed>=4||performance.now()-started>=3)return {removed,pending:true};
    }
    if(inspected>=BATCH)return {removed,pending:true};
  }
  return {removed,pending:false};
}
async function maintain({space:sample}={}){
  storageError=null;
  if(marker.legacyPending){
    legacyIterator??=legacyFiles(directory);
    const started=performance.now();
    for(let n=0;n<BATCH;n++){
      const next=await legacyIterator.next();
      if(next.done){marker.legacyPending=false;await atomicJson(markerFile,marker);legacyIterator=null;break;}
      if(next.value)try{await removeFile(next.value);}catch(e){storageError=e.code;await legacyIterator.return();legacyIterator=null;break;}
      if(performance.now()-started>=3)break;
    }
  }
  // A coordinator can supply its just-taken statfs sample; tests use this to
  // reproduce pressure without filling the developer's disk.
  const disk=sample??await space();
  if(!Number.isFinite(disk.capacity)||!Number.isFinite(disk.available)||disk.capacity<=0||disk.available<0||disk.available>disk.capacity)throw archiveError('ARCHIVE_INPUT','Invalid storage sample');
  const reserve=reserveBytes(disk.capacity),recovered=reserve+Math.max(16*MiB,reserve/4);
  const pressure=disk.available<(meta('pressure')?recovered:reserve);meta('pressure',pressure);
  if(pressure){const recovery=await reclaimRecovery(true);if(recovery.pending||recovery.removed)return {removed:recovery.removed,pressure:true,recoveryPending:recovery.pending};}
  const days=meta('retentionDays'),oldCutoff=meta('cutoff');
  let target=days===null?oldCutoff:Math.max(oldCutoff,clock()-days*DAY);
  const protectedIds=protectedRecords();
  // Keep only the bounded final Live images, not every stream since the oldest
  // such image. Archive queries always obey the common cutoff, without grace.
  const unprotected=protectedIds.length?` AND id NOT IN (${protectedIds.map(()=>'?').join(',')})`:'';
  if(pressure){
    const oldest=db.prepare('SELECT time FROM records WHERE time>=?'+unprotected+' ORDER BY time,id LIMIT 1').get(oldCutoff,...protectedIds);
    if(oldest)target=Math.max(target,oldest.time+1);
    else if(!db.prepare("SELECT 1 FROM assets WHERE state IN ('staged','delete') LIMIT 1").get())storageError='ARCHIVE_FULL';
  }
  const rows=db.prepare('SELECT id,asset,kind,source,context,role,time,data FROM records WHERE time<?'+unprotected+' ORDER BY time,id LIMIT ?').all(target,...protectedIds,cleanupBatch);
  const transactionStarted=performance.now();
  tx(()=>{
    // Hide all streams immediately at a common cutoff; physical cleanup is batched.
    meta('cutoff',Math.max(oldCutoff,target));
    for(const r of rows){
      if(r.kind==='transition')db.prepare(`INSERT INTO boundary_context VALUES(?,?,?,?,?,?) ON CONFLICT(kind,source,context,role) DO UPDATE SET time=excluded.time,data=excluded.data WHERE excluded.time>boundary_context.time`).run(r.kind,r.source,r.context,r.role,r.time,r.data);
      db.prepare('DELETE FROM records WHERE id=?').run(r.id);if(r.asset)db.prepare("UPDATE assets SET state='delete' WHERE id=?").run(r.asset);
    }
  });
  const transactionMs=performance.now()-transactionStarted;
  if(rows.length&&transactionMs>8)cleanupBatch=Math.max(8,Math.floor(cleanupBatch*8/transactionMs));
  const removed=transactionMs<8?await cleanupAssets():0;
  const cleanupPending=!!db.prepare("SELECT 1 FROM assets WHERE state IN ('staged','delete') LIMIT 1").get()||!!db.prepare('SELECT 1 FROM records WHERE time<?'+unprotected+' LIMIT 1').get(target,...protectedIds);
  // Let interactive work run between cleanup and maintenance flushes. SQLite's
  // bounded WAL auto-checkpoint remains active; FULL durability is unchanged.
  if(!rows.length&&!removed&&!cleanupPending&&(!meta('recoveryCheckpoint')||performance.now()-lastCheckpoint>=30000)){
    const checkpoint=db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
    if(meta('lastWrite')>0&&checkpoint.busy===0&&checkpoint.log===checkpoint.checkpointed)meta('recoveryCheckpoint',true);
    db.exec('PRAGMA incremental_vacuum(16)');lastCheckpoint=performance.now();
  }
  if(marker.recoveryBlocked&&meta('lastWrite')>0&&meta('recoveryCheckpoint')&&clock()-(marker.recoveries.at(-1)?.at??clock())>=DAY){marker.recoveryBlocked=false;await atomicJson(markerFile,marker);}
  return {recordsRemoved:rows.length,assetsRemoved:removed,cleanupPending,pressure,blocked:storageError};
}
async function status(){
  const disk=await space();let databaseBytes=0,recoveryDatabaseBytes=0;
  for(const suffix of ['','-wal','-shm','-journal'])if(await exists(file+suffix))databaseBytes+=(await regularFile(file+suffix)).size;
  for(const r of marker.recoveries)for(const suffix of ['','-wal','-shm','-journal','-wal.tmp','-shm.tmp','-journal.tmp']){const p=join(root,'recovery',r.id,'history.sqlite'+suffix);if(await exists(p))recoveryDatabaseBytes+=(await regularFile(p)).size;}
  const totals=Object.fromEntries(db.prepare('SELECT * FROM totals').all().map(r=>[r.key,r.value]));
  const cutoff=meta('cutoff');
  const oldest=db.prepare("SELECT time FROM records WHERE time>=? AND kind IN ('radar','cloud','weather','forecast','camera') ORDER BY time,id LIMIT 1").get(cutoff)?.time??null;
  const newest=db.prepare("SELECT time FROM records WHERE time>=? AND kind IN ('radar','cloud','weather','forecast','camera') ORDER BY time DESC,id DESC LIMIT 1").get(cutoff)?.time??null;
  const recoveryMediaBytes=marker.recoveries.reduce((sum,r)=>sum+(r.mediaBytes??0),0);
  return {schema:SCHEMA_VERSION,generation:marker.generation,retentionDays:meta('retentionDays'),cutoff,oldest,newest,...totals,databaseBytes,recoveryDatabaseBytes,recoveryMediaBytes,
    // No fabricated total: unindexed legacy/recovery media is explicitly unknown.
    accountedBytes:totals.mediaBytes+databaseBytes+recoveryDatabaseBytes+recoveryMediaBytes,accountingComplete:!marker.legacyPending&&marker.recoveries.every(r=>r.mediaReclaimed),
    availableBytes:disk.available,capacityBytes:disk.capacity,reserveBytes:reserveBytes(disk.capacity),pressure:!!meta('pressure'),warning:storageError,
    legacyPending:marker.legacyPending,recoveryCount:marker.recoveries.length,recoveryBlocked:marker.recoveryBlocked};
}
const methods={
  weatherState({source}){
    if(!['openweather','tempest','ha','policy'].includes(source))throw archiveError('ARCHIVE_INPUT','Invalid weather source');
    return meta(`weather:${source}`);
  },
  async saveWeatherState({source,value}){
    if(!['openweather','tempest','ha','policy'].includes(source)||!value||Buffer.byteLength(JSON.stringify(value))>128*1024)throw archiveError('ARCHIVE_INPUT','Invalid weather state');
    const key=`weather:${source}`;
    if(JSON.stringify(meta(key))===JSON.stringify(value))return;
    await writable(128*1024);meta(key,value);
  },
  async saveWeatherPolicy({value}){
    if(!value||Buffer.byteLength(JSON.stringify(value))>16384)throw archiveError('ARCHIVE_INPUT','Invalid weather policy');
    const record=validate({kind:'transition',source:'weather-policy',context:'appliance',time:value.effectiveAt,receivedAt:value.effectiveAt,data:value});
    await writable(128*1024);
    return tx(()=>{insert(record);meta('weather:policy',value);meta('lastWrite',clock());});
  },
  async put({records}){
    if(!Array.isArray(records)||records.length>BATCH)throw archiveError('ARCHIVE_INPUT','History batch exceeds limit');
    const checked=records.map(validate);if(checked.some(r=>['radar','cloud','camera'].includes(r.kind)))throw archiveError('ARCHIVE_INPUT','Images require atomic publication');
    if(checked.reduce((n,r)=>n+Buffer.byteLength(r.data),0)>512*1024)throw archiveError('ARCHIVE_INPUT','History batch too large');
    await writable(512*1024);
    return tx(()=>{let inserted=0;for(const r of checked)if(r.time>=meta('cutoff'))inserted+=insert(r);meta('lastWrite',clock());return {inserted};});
  },publish,range:q=>queryRange(q),latest:q=>queryRange(q,true),lastGood,
  calendar(q){
    const {clauses,params}=where(q,32*DAY);const times=db.prepare(`SELECT DISTINCT r.time FROM records r WHERE ${clauses.join(' AND ')} ORDER BY r.time LIMIT 513`).all(...params);
    return {times:times.slice(0,512).map(r=>r.time),next:times.length>512?times[511].time+1:null};
  },
  extent({context}){
    if(!text(context))throw archiveError('ARCHIVE_INPUT','Invalid radar context');
    const bounds=order=>db.prepare(`SELECT time FROM records WHERE kind IN ('radar','cloud') AND context=? AND time>=? ORDER BY time ${order} LIMIT 1`).get(context,meta('cutoff'))?.time??null;
    return {oldest:bounds('ASC'),newest:bounds('DESC')};
  },
  boundary({source,context,role=''}){
    if(!text(source)||!text(context)||!['','main','overview'].includes(role))throw archiveError('ARCHIVE_INPUT','Invalid boundary context');
    const row=db.prepare("SELECT * FROM boundary_context WHERE kind='transition' AND source=? AND context=? AND role=?").get(source,context,role);
    return row?{...row,data:JSON.parse(row.data)}:null;
  },
  contextBefore({source,context,end,role=''}){
    if(!text(source)||!text(context)||!validTime(end)||!['','main','overview'].includes(role))throw archiveError('ARCHIVE_INPUT','Invalid transition lookup');
    const row=db.prepare("SELECT time,data FROM records WHERE kind='transition' AND source=? AND context=? AND role=? AND time<=? ORDER BY time DESC LIMIT 1").get(source,context,role,end);
    const boundary=db.prepare("SELECT time,data FROM boundary_context WHERE kind='transition' AND source=? AND context=? AND role=? AND time<=?").get(source,context,role,end);
    const selected=!row?boundary:!boundary||row.time>=boundary.time?row:boundary;
    return selected?{time:selected.time,data:JSON.parse(selected.data)}:null;
  },
  async setRetention({days}){
    if(days!==null&&(!Number.isSafeInteger(days)||days<1||!Number.isSafeInteger(days*DAY)||days*DAY>8640000000000000))throw archiveError('ARCHIVE_INPUT','Retention must be whole days or storage-limited');
    marker.retentionDays=days;await atomicJson(markerFile,marker);meta('retentionDays',days);return maintain();
  },
  maintain,status,
  protect({contexts}){if(!Array.isArray(contexts)||contexts.length>4||contexts.some(c=>!text(c.context)||!text(c.main)||!text(c.overview)))throw archiveError('ARCHIVE_INPUT','Invalid protected contexts');protectedContexts=contexts;meta('protectedContexts',contexts);return true;},
  async close(){closed=true;if(legacyIterator)await legacyIterator.return();for(const i of recoveryIterators.values())await i.return();db.close();await releaseLease(root,leaseToken);return true;},
};
const workQueue=[];
let running=false,foregroundTurns=0;
const safeError=e=>({code:e.code??'ARCHIVE_IO',message:({ARCHIVE_INPUT:e.message,ARCHIVE_SCHEMA:e.message,ARCHIVE_STATE:e.message,ARCHIVE_FULL:e.message,ARCHIVE_RECOVERY:e.message,ARCHIVE_IMAGE:e.message})[e.code]??'Archive operation failed; saved data preserved'});
try{await initialize();parentPort.postMessage({ready:true});}
catch(error){if(db)try{db.close();}catch{}parentPort.postMessage({startError:safeError(error)});closed=true;}
async function drain(){
  if(running)return;running=true;
  while(workQueue.length){
    // Do not reorder close or settings mutations. Among a queued run of reads,
    // writes and cleanup, serve reads promptly but guarantee writer turns.
    const barrier=workQueue.findIndex(m=>['close','protect','setRetention'].includes(m.method));
    const searchable=barrier<0?workQueue.length:barrier;
    let index=0;
    if(searchable>0&&foregroundTurns<4){const found=workQueue.slice(0,searchable).findIndex(m=>['range','latest','lastGood','calendar','status'].includes(m.method));if(found>=0){index=found;foregroundTurns++;}else foregroundTurns=0;}else foregroundTurns=0;
    const message=workQueue.splice(index,1)[0];
    try{
      if(closed||!Object.hasOwn(methods,message.method))throw archiveError('ARCHIVE_CLOSED','Archive closed');
      const result=await methods[message.method](message.args);parentPort.postMessage({id:message.id,result});
    }catch(error){
      if(corrupt(error))try{await recover();error=archiveError('ARCHIVE_RESET','Archive recovered; retry operation');}catch(recoveryError){error=recoveryError;}
      parentPort.postMessage({id:message.id,error:safeError(error)});
    }
    // Let queued cancellation messages arrive between bounded statements.
    await new Promise(resolve=>setImmediate(resolve));
  }
  running=false;
}
parentPort.on('message',message=>{
  if(message.cancel){
    const index=workQueue.findIndex(m=>m.id===message.cancel&&['range','latest','calendar'].includes(m.method));
    if(index>=0){workQueue.splice(index,1);parentPort.postMessage({id:message.cancel,error:{code:'ABORT_ERR',message:'Archive read cancelled'}});}
    return;
  }
  workQueue.push(message);void drain();
});
