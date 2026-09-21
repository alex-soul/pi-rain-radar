// Bounded physical-media rehearsal. Creates only a new temporary directory,
// retains its evidence, and never accesses devices/providers or live volumes.
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import sharp from 'sharp';
import {createHistoryStore} from '../src/history-store.js';
const directory=await mkdtemp(join(tmpdir(),'radar-media-rehearsal-')),now=Date.now();
const bytes=await sharp(randomBytes(1920*1080*3),{raw:{width:1920,height:1080,channels:3}}).jpeg({quality:85}).toBuffer();
const store=await createHistoryStore(directory,{now});await store.setRetention(null);
console.log(JSON.stringify({directory,imageBytes:bytes.length,images:256,limitBytes:bytes.length*256,kind:'bounded high-entropy 1080p physical-media rehearsal'}));
const delay=monitorEventLoopDelay({resolution:10});delay.enable();
const writes=[];
for(let i=0;i<256;i++){
  const t=performance.now();await store.publish({kind:'camera',source:'fixture',context:'fixture',time:now-8*86400000+i*300000,receivedAt:now,basis:'acquisition',data:{}},bytes);writes.push(performance.now()-t);
}
await store.setRetention(7);const maintenance=[];
for(let i=0;i<300;i++){const t=performance.now();const result=await store.maintain();maintenance.push({ms:performance.now()-t,...result});if(!result.cleanupPending&&!result.recordsRemoved)break;}
delay.disable();const status=await store.status();await store.close();
const result={directory,imageBytes:bytes.length,writeP95Ms:writes.sort((a,b)=>a-b)[Math.floor(writes.length*.95)],maintenance,eventLoopP95Ms:delay.percentile(95)/1e6,eventLoopP99Ms:delay.percentile(99)/1e6,remainingRecords:status.records,remainingMediaBytes:status.mediaBytes};
console.log(JSON.stringify(result));await writeFile(join(directory,'results.json'),JSON.stringify(result,null,2));
