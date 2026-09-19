import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {createRadarSources} from '../src/radar-sources.js';
import {createCapturedArchive,cleanupCaptured} from '../src/captured-archive.js';
import {createRadarSettings} from '../src/radar-settings.js';
const png=await sharp({create:{width:256,height:256,channels:4,background:'#329db3'}}).png().toBuffer();
const views={view:{lat:0,lon:0,zoom:0,radarZoom:0,width:128,height:128},viewKey:'111111111111',overviewView:{lat:0,lon:0,zoom:1,radarZoom:1,width:128,height:128},overviewKey:'222222222222'};
async function directory(t){const dir=await mkdtemp(join(tmpdir(),'radar-source-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('routine incomplete history stays out of Log while failed acquisition is recorded',async t=>{
 const dir=await directory(t),time=Date.UTC(2026,8,19,12),events=[];let failed=false;
 const provider={getHistory:async()=>{if(failed)throw Error('offline');return [{time:time/1000-600},{time:time/1000}];},getTile:async frame=>{if(frame.time===time/1000-600)throw Error('missing old frame');return png;}};
 const radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},{views,now:()=>time,waitForSettle:()=>false,selection:()=>({main:'rainviewer',overview:'same'}),onEvent:code=>events.push(code)});
 await radar.refresh();assert.ok(radar.status().frame);assert.equal(events.includes('radar-error'),false);
 failed=true;await radar.refresh();assert.ok(events.includes('radar-error'));
});
test('cold startup publishes the fast map then seeds complete history after the slower map finishes',async t=>{
 const dir=await directory(t),time=Date.UTC(2026,8,17,12);
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const frames=Array.from({length:13},(_,i)=>({time:time/1000-(12-i)*600}));
 const providers={rainviewer:{getHistory:async()=>frames,getTile:async()=>png},rainbow:{getHistory:async()=>{await gate;return frames;},getTile:async()=>png}};
 const radar=await createRadarSources(dir,providers,{views,now:()=>time,waitForSettle:()=>false,selection:()=>({main:'rainbow',overview:'rainviewer'})});
 const pending=radar.refresh();
 try {
  for(let i=0;i<200&&!radar.status().frame;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(radar.status().frame?.overviewUrl);assert.equal(radar.status().frame.url,null);
 } finally {release();await pending;}
 assert.equal(radar.status().frames.length,13);
 assert.ok(radar.status().frames.every(frame=>frame.url&&frame.overviewUrl));
});
test('switching a provider between views reuses its settling clock, including after restart',async t=>{
 const dir=await directory(t),start=Date.UTC(2026,8,17,12);let time=start;
 let selected={main:'rainbow',overview:'rainviewer'};
 const provider={getHistory:async()=>[{time:start/1000}],getTile:async()=>png};
 const options={views,now:()=>time,waitForSettle:()=>true,selection:()=>selected};
 let radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},options);
 await radar.refresh();assert.equal(radar.status().frame,null);
 time+=300000;await radar.refresh();assert.ok(radar.status().frame.url);
 const reversed={main:'rainviewer',overview:'rainbow'};
 assert.equal((await radar.configure(reversed,async()=>{selected=reversed;})).status,200);
 assert.equal(radar.status().sources.overview.time,start/1000);
 // Restart with only pending observations: the destination views have no cache.
 const fresh=await directory(t);selected={main:'rainbow',overview:'rainviewer'};time=start;
 radar=await createRadarSources(fresh,{rainviewer:provider,rainbow:provider},options);
 await radar.refresh();time+=300000;
 radar=await createRadarSources(fresh,{rainviewer:provider,rainbow:provider},options);
 assert.equal((await radar.configure(reversed,async()=>{selected=reversed;})).status,200);
 assert.equal(radar.status().sources.main.time,start/1000);
 assert.equal(radar.status().sources.overview.time,start/1000);
});
test('one provider failure leaves an observation gap while another advances; provenance survives switching and restart',async t=>{
 const dir=await directory(t);let time=Date.UTC(2026,8,17,12),failed=false,selected={main:'rainviewer',overview:'rainbow'};
 const provider=source=>({getHistory:async()=>[{time:time/1000}],getTile:async()=>{if(source==='rainbow'&&failed)throw Error('offline');return png;}});
 const providers={rainviewer:provider('rainviewer'),rainbow:provider('rainbow')};
 const options={views,now:()=>time,waitForSettle:()=>false,selection:()=>selected};
 const radar=await createRadarSources(dir,providers,options);await radar.refresh();const first=radar.status().frame;
 assert.equal(first.source,'rainviewer');assert.equal(first.overviewSource,'rainbow');
 time+=600000;failed=true;await radar.refresh();const next=radar.status().frame;
 assert.notEqual(next.url,first.url);assert.equal(next.overviewUrl,null);assert.equal(radar.status().sources.overview.state,'warning');
 failed=false;const replacement={main:'rainbow',overview:'rainviewer'};
 const result=await radar.configure(replacement,async()=>{selected=replacement;});assert.equal(result.status,200);
 assert.equal(radar.archive.window(first.time).frames.at(-1).source,'rainviewer');
 const resumed=await createRadarSources(dir,providers,options);assert.equal(resumed.archive.window(first.time).frames.at(-1).overviewSource,'rainbow');
});
test('each provider settles separately and failed source switch does not commit configuration',async t=>{
 const dir=await directory(t);const start=Date.UTC(2026,8,17,12);let time=start,committed=false,fail=true;
 const providers={rainviewer:{getHistory:async()=>[{time:start/1000}],getTile:async()=>png},rainbow:{getHistory:async()=>{if(fail)throw Error('offline');return [{time:start/1000}];},getTile:async()=>png}};
 const radar=await createRadarSources(dir,providers,{views,now:()=>time,waitForSettle:()=>true,selection:()=>({main:'rainviewer',overview:'rainbow'})});
 await radar.refresh();assert.equal(radar.status().frame,null);
 time=start+180000;fail=false;await radar.refresh();assert.equal(radar.status().frame,null);
 time=start+300000;await radar.refresh();assert.ok(radar.status().frame.url);assert.equal(radar.status().frame.overviewUrl,null);
 time=start+480000;await radar.refresh();assert.ok(radar.status().frame.overviewUrl);
 fail=true;assert.equal((await radar.configure({main:'rainbow',overview:'same'},async()=>{committed=true;})).status,503);assert.equal(committed,false);
});
test('capture index validates persisted references and imports only complete legacy pairs',async t=>{
 const dir=await directory(t),time=Date.UTC(2026,8,17,12)/1000;
 await writeFile(join(dir,`${time}-${views.viewKey}.png`),png);await writeFile(join(dir,`${time}-${views.overviewKey}.png`),png);
 const archive=await createCapturedArchive(dir,'aaaaaaaaaaaa',{now:()=>time*1000,legacyViews:views});assert.equal(archive.frames().length,1);
 await archive.capture({time:time+600,url:`/frames/${time}-${views.viewKey}.png`,overviewUrl:null,source:'rainviewer',overviewSource:null});
 assert.equal(archive.frames().length,2);
 await writeFile(join(dir,'captured-aaaaaaaaaaaa.json'),'[{"time":1,"url":"/settings/rainbow.json"}]');
 await assert.rejects(createCapturedArchive(dir,'aaaaaaaaaaaa'),/Captured history is invalid/);
});
test('source settings commit only after successful preparation and retain old-format settling choice',async t=>{
 const dir=await directory(t),settings=await createRadarSettings(dir);await settings.configure({waitForSettle:false});
 settings.setApply(async()=>({status:503}));assert.equal((await settings.configure({waitForSettle:true,main:'rainbow'})).status,503);assert.equal(settings.current().main,'rainviewer');
 settings.setApply(async(next,commit)=>{await commit();return {status:200};});await settings.configure({waitForSettle:true,main:'rainbow',monthlyLimit:100});
 const restored=await createRadarSettings(dir);assert.equal(restored.current().main,'rainbow');assert.equal(restored.current().monthlyLimit,100);
 assert.ok(!JSON.stringify(restored.current()).includes('apiKey'));
});
test('seven-day cleanup protects images retained in recent captures and removes unreferenced old images',async t=>{
 const dir=await directory(t),time=Date.UTC(2026,8,17,12),old=time/1000-9*86400;
 const retained=`${old}-111111111111.png`,unused=`${old}-222222222222.png`;
 await writeFile(join(dir,retained),png);await writeFile(join(dir,unused),png);
 const archive=await createCapturedArchive(dir,'bbbbbbbbbbbb',{now:()=>time});
 await archive.capture({time:time/1000,url:'/frames/'+retained,overviewUrl:null,source:'rainbow',overviewSource:null});
 await cleanupCaptured(dir,()=>time);assert.ok(await readFile(join(dir,retained)));await assert.rejects(readFile(join(dir,unused)),{code:'ENOENT'});
});
