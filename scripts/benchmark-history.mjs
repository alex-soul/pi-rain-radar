// Explicit, disposable metadata-scale benchmark. No provider calls and no
// production data. Retains its generated directory for repeatable inspection.
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {createHistoryStore} from '../src/history-store.js';
import {createRadarHistory} from '../src/radar-history.js';
import {loadWeatherHistory} from '../src/weather-history.js';
import {cameraHistory} from '../src/camera.js';
import {defaultViews,hash} from '../src/map.js';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';

const directory=await mkdtemp(join(tmpdir(),'radar-scale-rehearsal-'));
const now=Math.floor(Date.now()/600000)*600000,day=86400000,context=hash(defaultViews),location={lat:52,lon:-1};
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
const summary=values=>({p50:percentile(values,.5),p95:percentile(values,.95),max:Math.max(...values)});
let store=await createHistoryStore(directory,{now});await store.setRetention(null);
// Only the latest Live window has real raster bytes; older rows remain an
// explicitly metadata-only scale corpus. This permits actual server startup.
for(const role of ['main','overview']){
  const view=role==='main'?defaultViews.view:defaultViews.overviewView;
  const png=await sharp({create:{width:view.width,height:view.height,channels:4,background:'#00000000'}}).png().toBuffer();
  for(let i=0;i<=12;i++)await store.publish({kind:'radar',source:'rainviewer',context,role,time:now-i*600000,receivedAt:now,data:{}},png);
}
await store.close();
console.log(JSON.stringify({directory,kind:'metadata-only; no physical-media or Pi claim',now}));
let seeded=0;
const results=[];
for(const days of [7,30,365,1825]){
  const db=new DatabaseSync(join(directory,'archive/history.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
  const insert=db.prepare('INSERT OR IGNORE INTO records(kind,source,context,role,time,received_at,basis,data) VALUES(?,?,?,?,?,?,?,?)');
  const begin=performance.now();
  for(let base=seeded;base<=days*144;base+=1000){
    db.exec('BEGIN');
    for(let i=base;i<=Math.min(base+999,days*144);i++){
      const time=now-i*600000;
      for(const role of ['main','overview']){
        insert.run('radar','rainviewer',context,role,time,time,null,'{}');
        insert.run('incident','rainviewer',context,role,time,time,null,JSON.stringify({tracked:true,gap:false,arrivedAt:time}));
      }
      insert.run('weather','openweather','52,-1','',time,time,null,JSON.stringify({current:{time:time/1000,tempC:12,windMph:5},gust:null}));
      insert.run('forecast','openweather','52,-1','',time,time,null,JSON.stringify({points:Array.from({length:60},(_,n)=>({time:time/1000+n*60,rain:n%7/10}))}));
      for(const offset of [0,300000])insert.run('camera','fixture','fixture','',time-offset,time-offset,offset?'metadata':'acquisition',JSON.stringify({name:'Synthetic camera',width:1920,height:1080}));
    }
    db.exec('COMMIT');
  }
  seeded=days*144+1;db.close();
  const seedMs=performance.now()-begin,startups=[],queries=[],calendars=[];
  let radar;
  for(let n=0;n<5;n++){
    const t=performance.now();store=await createHistoryStore(directory,{now});
    radar=await createRadarHistory(store,defaultViews,{now:()=>now,selection:{main:'rainviewer',overview:'same'}});
    startups.push(performance.now()-t);
    if(n<4)await store.close();
  }
  let bytes=0;
  for(let n=0;n<200;n++){
    const end=now/1000-(n%Math.max(1,days-2))*86400;
    let t=performance.now();
    const payload=await Promise.all([radar.window(end,24),loadWeatherHistory(store,location,end,24),cameraHistory(store,end*1000,24)]);
    queries.push(performance.now()-t);bytes=Math.max(bytes,Buffer.byteLength(JSON.stringify(payload)));
    assert.ok(payload[0]?.frames.length);assert.ok(payload[1].forecasts.length);assert.ok(payload[2].records.length);
    t=performance.now();await radar.available((end-31*86400)*1000,end*1000);calendars.push(performance.now()-t);
  }
  const record={days,seedMs,records:(await store.status()).records,startupMs:summary(startups),combined24hMs:summary(queries),calendarMs:summary(calendars),maxStructuredBytes:bytes,rssMiB:process.memoryUsage().rss/1048576};
  if(days===1825){
    // Real worker publication and age pruning compete with bounded reads for a
    // full minute. Small test images are covered by the separate media tests.
    await store.protect([{context,main:'rainviewer',overview:'rainviewer'}]);await store.setRetention(1824);
    const delays=monitorEventLoopDelay({resolution:10});delays.enable();
    const elapsed=performance.now(),reads=[],maintenance=[];let writes=0;
    const writer=(async()=>{while(performance.now()-elapsed<60000){await store.put([{kind:'weather',source:'fixture',context:'concurrent',time:now+writes,receivedAt:now,data:{tempC:12}}]);writes++;const t=performance.now();await store.maintain();maintenance.push(performance.now()-t);await new Promise(resolve=>setTimeout(resolve,100));}})();
    while(performance.now()-elapsed<60000){const t=performance.now();await Promise.all([radar.window(now/1000,24),loadWeatherHistory(store,location,now/1000,24),cameraHistory(store,now,24)]);reads.push(performance.now()-t);await new Promise(resolve=>setTimeout(resolve,20));}
    await writer;delays.disable();
    record.concurrent={durationMs:performance.now()-elapsed,writes,queries:reads.length,combined24hMs:summary(reads),maintenanceMs:summary(maintenance),eventLoopP95Ms:delays.percentile(95)/1e6,eventLoopP99Ms:delays.percentile(99)/1e6,eventLoopMaxMs:delays.max/1e6};
  }
  await store.close();
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const started=performance.now();
  const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,DATA_DIR:directory,BIND_ADDRESS:'127.0.0.1',PORT:String(port),RADAR_MANUAL_REFRESH:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('HTTP startup timeout')),30000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',()=>{clearTimeout(timer);reject(Error('HTTP server exited'));});child.stdout.on('data',data=>{if(String(data).includes('listening on port')){clearTimeout(timer);resolve();}});child.stderr.resume();});
    record.httpStartupMs=performance.now()-started;const timings=[];
    for(let i=0;i<100;i++){const t=performance.now();const response=await fetch(`http://127.0.0.1:${port}/api/archive?end=${now/1000}&hours=24`);assert.equal(response.status,200);const body=await response.json();assert.ok(body.frames.length);timings.push(performance.now()-t);}
    record.directHttp24hMs=summary(timings);
  }finally{const stopped=once(child,'exit');child.kill();await stopped;}
  results.push(record);console.log(JSON.stringify(record));
  await writeFile(join(directory,'results.json'),JSON.stringify({directory,results},null,2));
}
