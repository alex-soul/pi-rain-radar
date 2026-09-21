import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHistoryStore} from '../src/history-store.js';

// This test verifies indexed selection/worker isolation, not real media scale
// or Raspberry Pi performance. The full release benchmark is a separate gate.
test('five years of radar metadata stays paginated and does not block the caller event loop',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'radar-history-scale-'));
  let store; t.after(async()=>{await store?.close();await rm(directory,{recursive:true,force:true});});
  const now=Date.UTC(2026,8,20,12);
  store=await createHistoryStore(directory,{now});await store.setRetention(null);await store.close();
  const db=new DatabaseSync(join(directory,'archive','history.sqlite'));
  const insert=db.prepare("INSERT INTO records(kind,source,context,role,time,received_at,data) VALUES('radar','rainviewer','map','main',?,?,'{}')");
  // 262,801 main-map timestamps: five years at a ten-minute cadence.
  for(let base=0;base<=1825*144;base+=1000){
    db.exec('BEGIN');for(let i=base;i<Math.min(base+1000,1825*144+1);i++)insert.run(now-i*600000,now);db.exec('COMMIT');
  }
  const plan=db.prepare("EXPLAIN QUERY PLAN SELECT * FROM records WHERE kind='radar' AND context='map' AND time>=? AND time<=? ORDER BY time,id LIMIT 129").all(now-86400000,now);
  assert.ok(plan.some(row=>row.detail.includes('SEARCH')&&row.detail.includes('records_range')));
  db.close();store=await createHistoryStore(directory,{now});
  const before=Date.now();let ticks=0;const timer=setInterval(()=>ticks++,1);
  try{
    for(let i=0;i<100;i++){
      const end=now-i*86400000;
      const result=await store.range({kind:'radar',context:'map',start:end-86400000,end,limit:64});
      assert.equal(result.records.length,64);assert.ok(result.next);
    }
  }finally{clearInterval(timer);}
  assert.ok(ticks>0,'worker queries let the caller event loop run');
  t.diagnostic(JSON.stringify({records:262801,queries:100,elapsedMs:Date.now()-before,callerTimerTicks:ticks}));
});

test('cancelled reads do not prevent subsequent writes or leak request admission',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'radar-history-cancel-'));
  const now=Date.UTC(2026,8,20,12),store=await createHistoryStore(directory,{now});
  t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});
  const query={kind:'weather',context:'here',start:now-1000,end:now};
  for(let i=0;i<100;i++){
    const controller=new AbortController();const result=store.range(query,{signal:controller.signal});controller.abort();
    await assert.rejects(result,{code:'ABORT_ERR'});await store.status();
  }
  await store.put([{kind:'weather',source:'test',context:'here',time:now,receivedAt:now,data:{}}]);
  assert.equal((await store.range(query)).records.length,1);
});

test('healthy replacement rearms recovery only after durable writes and a full day',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'radar-history-rearm-'));let store;
  t.after(async()=>{await store?.close();await rm(directory,{recursive:true,force:true});});
  const now=Date.UTC(2026,8,20,12);
  store=await createHistoryStore(directory,{now});await store.close();
  await writeFile(join(directory,'archive','history.sqlite'),'broken');store=await createHistoryStore(directory,{now});
  await store.put([{kind:'weather',source:'test',context:'here',time:now,receivedAt:now,data:{}}]);await store.maintain();
  assert.equal((await store.status()).recoveryBlocked,true);await store.close();
  store=await createHistoryStore(directory,{now:now+86400001});await store.maintain();assert.equal((await store.status()).recoveryBlocked,false);
  assert.equal(JSON.parse(await readFile(join(directory,'archive','state.json'))).recoveryBlocked,false);
});
