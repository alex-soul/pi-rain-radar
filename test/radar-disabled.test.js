import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import {createRadarSources} from '../src/radar-sources.js';
import {createHistoryStore} from '../src/history-store.js';
import {createRadarSettings} from '../src/radar-settings.js';
import {disableRadarProviders} from '../public/radar-policy.js';
import {radarSourceHealth,worstHealth} from '../public/health.js';
const views={view:{lat:52.4,lon:-1.5,zoom:7,width:64,height:64},viewKey:'main',overviewView:{lat:52.4,lon:-1.5,zoom:5,width:64,height:64},overviewKey:'overview'};
test('disabled views stop acquisition, clear Live and preserve historical radar through restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'radar-disabled-'));let time=Math.floor(Date.now()/600000)*600000;
 const store=await createHistoryStore(dir,{now:time+2*86400000});t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
 const png=await sharp({create:{width:256,height:256,channels:4,background:'#abc'}}).png().toBuffer();let calls=0,selected={main:'rainviewer',overview:'same'};
 const provider={getHistory:async()=>{calls++;return [{time:time/1000}];},getTile:async()=>png};
 const options={store,views,now:()=>time+300000,waitForSettle:()=>false,selection:()=>selected};
 let radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},options);await radar.refresh();const oldEnd=time/1000;
 assert.ok(radar.status().frame.url);assert.ok(radar.status().frame.overviewUrl);
 time+=600000;let next={main:'disabled',overview:'same'};
 assert.equal((await radar.configure(next,async()=>{selected=next;})).status,200);const stopped=calls;await radar.refresh();
 assert.equal(calls,stopped);assert.equal(radar.status().radarDisabled,true);assert.equal(radar.status().frames.length,0);assert.equal(radar.status().counts.main.missing,0);
 assert.deepEqual(radarSourceHealth(radar.status().sources.main),['unconfigured','Disabled']);
 assert.ok((await radar.archive.window(oldEnd,2)).frames.some(frame=>frame.url&&frame.overviewUrl));
 await radar.observe();const incidents=await store.range({context:radar.archive.context,kind:'incident',source:'disabled',start:time-86400000,end:time,limit:256});assert.equal(incidents.records.length,0);
 next={main:'disabled',overview:'rainviewer'};assert.equal((await radar.configure(next,async()=>{selected=next;})).status,200);await radar.refresh();
 assert.equal(radar.status().radarDisabled,false);assert.ok(radar.status().frames.every(frame=>!frame.url&&frame.overviewUrl));
 assert.equal(radar.status().counts.main.missing,0);assert.equal(worstHealth([radarSourceHealth(radar.status().sources.main),radarSourceHealth(radar.status().sources.overview)])[0],'ready');
 radar=await createRadarSources(dir,{rainviewer:provider,rainbow:provider},options);assert.equal(radar.status().sources.main.state,'disabled');assert.ok(radar.status().frame.overviewUrl);
});
test('provider-off resolves Same as Main before modifying selections and stays disabled after re-enable',async t=>{
 assert.deepEqual(disableRadarProviders({main:'rainbow',overview:'same'},s=>s!=='rainbow'),{main:'disabled',overview:'disabled'});
 assert.deepEqual(disableRadarProviders({main:'rainbow',overview:'rainviewer'},s=>s!=='rainbow'),{main:'disabled',overview:'rainviewer'});
 const dir=await mkdtemp(join(tmpdir(),'radar-policy-disabled-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let settings=await createRadarSettings(dir);settings.setApply(async(next,commit)=>{await commit();return {status:200};});
 assert.equal((await settings.configure({waitForSettle:true,main:'disabled',overview:'same'})).status,200);
 settings=await createRadarSettings(dir);assert.equal(settings.current().main,'disabled');
 assert.deepEqual(disableRadarProviders(settings.current(),()=>true),settings.current());
});
test('camera refresh does not require a radar end timestamp',async()=>{
 const code=(await readFile(new URL('../public/camera-widget.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');let url;
 const node={dataset:{},addEventListener(){},removeAttribute(){},dispatchEvent(){}};
 const c=vm.createContext({document:{getElementById:()=>node,querySelector:()=>({content:'Europe/London'})},window:{dispatchEvent(){}},Event,AbortSignal,
  setupFloatingWidget(){},createFrameLoader:()=>({}),cameraAt:()=>null,formatTime:()=>'',fetch:async value=>{url=value;return {ok:true,json:async()=>({latest:null,counts:{}})};}});
 vm.runInContext(code,c);c.updateCamera({status:{end:null,camera:{source:'test'}},hours:2});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(url,'/api/camera?hours=2');
});
