import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {createClouds} from '../src/clouds.js';
import {createHistoryStore} from '../src/history-store.js';
import {defaultSettings,makeViews,radarTiles,hash} from '../src/map.js';
import {availabilityRows} from '../public/availability-model.js';
const time=Math.floor(Date.now()/600000)*600000;
const tile=await sharp({create:{width:256,height:256,channels:4,background:'#ffffff80'}}).png().toBuffer();
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'radar-cloud-test-')),store=await createHistoryStore(dir,{now:time+86400000});let clock=time,configured=true,calls=0;
 const provider={configured:()=>configured,status:()=>({usage:{total:calls}}),cloudSnapshot:async()=>{calls++;return time/1000;},cloudTile:async()=>{calls++;return tile;}};
 const options={store,provider,settings:()=>defaultSettings,now:()=>clock,autoStart:false};let clouds=await createClouds(dir,options);
 t.after(async()=>{await clouds.close();await store.close();await rm(dir,{recursive:true,force:true});});
 return {dir,store,provider,options,get clouds(){return clouds;},get calls(){return calls;},advance:()=>clock+=600000,setTime:value=>clock=value,key:value=>configured=value,async reopen(){await clouds.close();clouds=await createClouds(dir,options);}};
}
test('cloud defaults, independent map selection, caching and persistent key-off retain archive',async t=>{
 const f=await fixture(t);assert.equal((await f.clouds.status()).enabled,false);assert.equal((await f.clouds.status()).map,'main');await f.clouds.collect();assert.equal(f.calls,0);
 await f.clouds.configure({enabled:true});await f.clouds.collect();
 const mainCalls=1+13*radarTiles(makeViews(defaultSettings).view).length;assert.equal(f.calls,mainCalls);
 const first=await f.clouds.window(time/1000,2);assert.equal(first.frames.length,13);assert.ok(first.frames.every(x=>x.url&&!x.overviewUrl));
 await f.clouds.configure({map:'both'});await f.clouds.collect();assert.equal(f.calls,mainCalls+1+13*radarTiles(makeViews(defaultSettings).overviewView).length);
 assert.ok((await f.clouds.window(time/1000,2)).frames.every(x=>x.url&&x.overviewUrl));
 f.advance();await f.clouds.collect();assert.equal(f.calls,mainCalls+2+13*radarTiles(makeViews(defaultSettings).overviewView).length);
 await f.clouds.configure({enabled:false});const live=await f.clouds.augment({start:time/1000-7200,end:time/1000,frames:[],radarDisabled:true},2);assert.equal(live.frames.length,0);
 const archive=await f.clouds.augment(null,2,{archive:true,end:time/1000});assert.equal(archive.frames.length,13);assert.ok(archive.frames[0].cloudUrl&&archive.frames[0].overviewCloudUrl);
 f.key(false);assert.equal((await f.clouds.configure({enabled:true})).status,400);await f.reopen();assert.equal((await f.clouds.status()).enabled,false);f.key(true);assert.equal((await f.clouds.status()).enabled,false);
 assert.equal(JSON.parse(await readFile(join(f.dir,'settings/clouds.json'))).enabled,false);
});
test('cloud budget errors pause collection truthfully and late frames never borrow from the future',async t=>{
 const f=await fixture(t);await f.clouds.configure({enabled:true});await f.clouds.collect();
 const at=await f.clouds.augment({start:time/1000-7200,end:time/1000,frames:[{time:time/1000-300,url:null}],radarDisabled:true},2);
 const frame=at.frames.find(x=>x.time===time/1000-300);assert.equal(frame.cloudTime,time/1000-600);
 const archive=await f.clouds.augment({start:time/1000-7200,end:time/1000,frames:[{time:time/1000-300}]},2,{archive:true});assert.equal(archive.frames.find(x=>x.time===time/1000-300).cloudUrl,null);
 const late=await f.clouds.augment({start:time/1000,end:time/1000+2400,frames:[{time:time/1000+2400,url:null}]},2).catch(()=>null);
 // Expired cloud data is not carried to or beyond its forty-minute bound.
 assert.equal(late.frames.find(x=>x.time===time/1000+2400).cloudUrl,null);
 f.provider.cloudSnapshot=async()=>{throw Object.assign(Error('budget'),{code:'test-limit'});};f.advance();await f.clouds.collect();assert.equal((await f.clouds.status()).state,'budget');
});

test('cloud health uses the oldest enabled view at exact 40/60 minute boundaries; Live borrowing remains separate',async t=>{
 const f=await fixture(t),context=hash(makeViews(defaultSettings));await f.clouds.configure({enabled:true,map:'both'});
 for(const [role,stamp]of [['main',time],['overview',time-600000]])await f.store.publish({kind:'cloud',source:'rainbow',context,role,time:stamp,receivedAt:time,data:{}},tile);
 f.setTime(time+1799999);assert.equal((await f.clouds.status()).state,'ready');f.setTime(time+1800000);assert.equal((await f.clouds.status()).state,'delayed');f.setTime(time+3000000);assert.equal((await f.clouds.status()).state,'stale');
 await f.clouds.configure({map:'main'});f.setTime(time+2399999);assert.equal((await f.clouds.status()).state,'ready');f.setTime(time+2400000);assert.equal((await f.clouds.status()).state,'delayed');f.setTime(time+3600000);assert.equal((await f.clouds.status()).state,'stale');f.setTime(time+7200000);assert.equal((await f.clouds.status()).state,'stale');
 const start=time/1000,end=start+3000,base={start,end,collectionPeriods:[{time:start-600,clouds:true,cloudMap:'main'}],frames:[{time:start-300},{time:start+1800},{time:start+2400},{time:end}]};
 const live=await f.clouds.augment(base,2);assert.equal(live.frames.find(r=>r.time===start-300).cloudUrl,null);assert.equal(live.frames.find(r=>r.time===start+1800).cloudTime,start);assert.equal(live.frames.find(r=>r.time===end).cloudUrl,null);
 const archive=await f.clouds.augment(base,2,{archive:true});assert.equal(archive.frames.find(r=>r.time===start+1800).cloudUrl,null);
 const row=availabilityRows({frames:live.frames,data:live,status:{clouds:{enabled:true}},start,end,archive:false}).find(r=>r.label==='Clouds');assert.equal(row.segments.find(r=>r.time===start+1800).health,'warning');assert.equal(row.segments.find(r=>r.time===start+2400).health,'error');assert.equal(row.segments.at(-1).health,'pending');
 f.provider.cloudSnapshot=async()=>{throw Error('offline');};await f.clouds.configure({map:'main'});await f.clouds.collect();assert.equal((await f.clouds.status()).state,'error');await f.clouds.configure({enabled:false});assert.equal((await f.clouds.status()).state,'disabled');
});

test('delayed provider snapshot finishes successfully without inventing newer cloud frames',async t=>{
 const f=await fixture(t);f.provider.cloudSnapshot=async()=>time/1000-1200;
 await f.clouds.configure({enabled:true,map:'both'});await f.clouds.collect();
 const state=await f.clouds.status();assert.equal(state.error,null);assert.equal(state.lastSuccess,time);
 assert.deepEqual(state.latest,{main:time-1200000,overview:time-1200000});
 const calls=f.calls;await f.clouds.collect();assert.equal(f.calls,calls);
 f.advance();await f.clouds.collect();assert.equal(f.calls,calls); // retained tiles are not downloaded again
});
test('not-yet-published newest tiles leave gaps despite successful pass and recover at next poll',async t=>{
 const f=await fixture(t),original=f.provider.cloudTile;
 f.provider.cloudTile=async frame=>{if(frame>time/1000-1200)throw Object.assign(Error('not yet available'),{code:'not-found'});return original();};
 await f.clouds.configure({enabled:true,map:'both'});await f.clouds.collect();
 assert.equal((await f.clouds.status()).lastSuccess,time);assert.equal((await f.clouds.status()).error,null);
 assert.deepEqual((await f.clouds.status()).latest,{main:time-1200000,overview:time-1200000});
 f.provider.cloudTile=original;f.advance();await f.clouds.collect();
 assert.deepEqual((await f.clouds.status()).latest,{main:time,overview:time});
});
