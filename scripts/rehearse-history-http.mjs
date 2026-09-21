// Disposable real-server comparison: identical HTTP traffic before and during
// rolling deletion of physical media. No providers, devices or production data.
// Run in a --network none container with an isolated volume and one CPU on Pi.
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHistoryStore} from '../src/history-store.js';
import {defaultViews,hash} from '../src/map.js';
import {setPin} from '../src/settings-auth.js';
const directory=await mkdtemp(join(tmpdir(),'radar-http-rehearsal-'));
const now=Math.floor(Date.now()/600000)*600000,context=hash(defaultViews),seconds=Number(process.argv[2]??60);
assert.ok(seconds>=10&&seconds<=300);
const store=await createHistoryStore(directory);await store.setRetention(null);
for(const role of ['main','overview']){
  const view=role==='main'?defaultViews.view:defaultViews.overviewView;
  const png=await sharp({create:{width:view.width,height:view.height,channels:4,background:'#00000000'}}).png().toBuffer();
  for(let i=0;i<=12;i++)await store.publish({kind:'radar',source:'rainviewer',context,role,time:now-i*600000,receivedAt:now,data:{}},png);
}
const jpeg=await sharp(randomBytes(1920*1080*3),{raw:{width:1920,height:1080,channels:3}}).jpeg({quality:85}).toBuffer();
for(let i=0;i<192;i++)await store.publish({kind:'camera',source:'fixture',context:'fixture',time:now-8*86400000+i*300000,receivedAt:now,basis:'acquisition',data:{}},jpeg);
await store.close();await setPin(directory,'123456'); // disposable fixture PIN only
console.log(JSON.stringify({directory,seconds,imageBytes:jpeg.length,images:192,kind:'actual HTTP before/during physical cleanup; no collector traffic'}));
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
const output=[],child=spawn(process.execPath,['src/server.js'],{env:{...process.env,DATA_DIR:directory,BIND_ADDRESS:'127.0.0.1',PORT:String(port),RADAR_MANUAL_REFRESH:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
const base=`http://127.0.0.1:${port}`,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const summarize=values=>{values.sort((a,b)=>a-b);return {samples:values.length,p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1)};};
async function sample(){
  const archive=[],health=[],counts=[],started=performance.now();
  while(performance.now()-started<seconds*1000){
    await Promise.all([
      (async()=>{const start=performance.now(),r=await fetch(base+`/api/archive?end=${now/1000}&hours=24`);assert.equal(r.status,200);assert.ok((await r.json()).frames.length);archive.push(performance.now()-start);})(),
      (async()=>{const start=performance.now(),r=await fetch(base+'/healthz');assert.equal(r.status,200);assert.equal((await r.json()).ok,true);health.push(performance.now()-start);})(),
    ]);
    if(archive.length%20===0){const status=await (await fetch(base+'/api/status')).json();counts.push({elapsedMs:performance.now()-started,mediaBytes:status.storage.mediaBytes});}
    await sleep(50);
  }
  return {durationMs:performance.now()-started,archiveMs:summarize(archive),healthMs:summarize(health),counts};
}
try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),60000);child.on('error',reject);child.on('exit',()=>reject(Error('server exited')));child.stdout.on('data',data=>{output.push(String(data));if(String(data).includes('listening on port')){clearTimeout(timer);resolve();}});child.stderr.on('data',data=>output.push(String(data)));});
  const baseline=await sample();console.log(JSON.stringify({baseline}));
  const login=await fetch(base+'/api/settings/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'123456'})});assert.equal(login.status,200);const {token}=await login.json();
  const changed=await fetch(base+'/api/settings/storage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({days:7})});assert.equal(changed.status,200);
  const cleanup=await sample(),result={directory,baseline,cleanup,archiveP95IncreaseMs:cleanup.archiveMs.p95-baseline.archiveMs.p95};
  console.log(JSON.stringify(result));await writeFile(join(directory,'results.json'),JSON.stringify(result,null,2));
}finally{const stopped=once(child,'exit');child.kill();await stopped;await writeFile(join(directory,'server.log'),output.join(''));}
