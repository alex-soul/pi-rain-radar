import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultSettings,legacyDefaultSettings,defaultViews,makeViews,validateMapSettings,radarTiles,project} from '../src/map.js';
import {createMapSettings,mapId} from '../src/map-settings.js';
import {prepareMapAssets,mapAnnotations} from '../src/map-assets.js';
import {mapPage} from '../src/map-page.js';
import {createRadar} from '../src/radar.js';
import sharp from 'sharp';

async function fixture(t) {const dir=await mkdtemp(join(tmpdir(),'radar-map-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
async function idle(maps) {for(let i=0;i<200&&maps.status().busy;i++)await new Promise(r=>setTimeout(r,5));assert.equal(maps.status().busy,false);}
test('legacy geometry preserves cache keys; validation bounds work and tile requests wrap across the dateline',()=>{
  assert.deepEqual(makeViews(defaultSettings),defaultViews);
  assert.equal(makeViews(legacyDefaultSettings).viewKey,'ffed48cda873');
  assert.equal(makeViews(legacyDefaultSettings).overviewKey,'63b4631ffcb8');
  assert.deepEqual(validateMapSettings(defaultSettings),defaultSettings);
  for(const values of [{lat:NaN},{lon:181},{zoom:5},{overviewZoom:8},{name:'x'.repeat(61)},{overviewZoom:7,zoom:6},{lat:80,overviewZoom:2}]) assert.throws(()=>validateMapSettings({...defaultSettings,...values}));
  const nearDateLine=makeViews({...defaultSettings,lon:179.99});
  assert.deepEqual(project(179.99,defaultSettings.lat,nearDateLine.view),[640,360]);
  assert.ok(radarTiles(nearDateLine.view).every(t=>t.x>=0&&t.x<2**t.zoom));
});
test('blank location names hide only the centre label and preserve geography',async()=>{
  const settings=validateMapSettings({...defaultSettings,name:'   '});
  assert.equal(settings.name,'');
  assert.deepEqual(makeViews(settings),defaultViews);
  const template=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const html=mapPage(template,{settings,id:mapId(settings)});
  assert.match(html,/<title>Pi Rain Radar<\/title>/);
  assert.ok(!html.includes('{{'));
  assert.ok(!html.includes('Coventry'));
  assert.ok(!html.includes('<text x="640" y="402"'));
  assert.match(html,/<circle cx="640"/);
});

test('map apply is atomic, persistent, bounded to one job and keeps the previous view on failure',async t=>{
  const directory=await fixture(t);let release,fail=false;const changes=[];
  const options={prepare:async()=>{},radarFactory:async(_d,_p,{views})=>({refresh:async()=>{await new Promise(r=>release=r);},status:()=>({frames:fail?[]:[{time:123}],view:views.view})}),onChange:async v=>changes.push(v)};
  const maps=await createMapSettings(directory,options);
  assert.deepEqual(maps.current().settings,defaultSettings);
  const next={...defaultSettings,name:'Paris',lat:48.8566,lon:2.3522,zoom:7.5};
  assert.equal(maps.configure(next).status,202);
  assert.equal(maps.configure(next).status,409);
  await new Promise(r=>setImmediate(r));
  assert.equal(maps.current().settings.name,'Coventry');
  release();await idle(maps);
  assert.deepEqual(maps.current().settings,next);assert.equal(changes.length,1);
  assert.deepEqual(JSON.parse(await readFile(join(directory,'settings','map.json'))),next);
  assert.deepEqual((await createMapSettings(directory,options)).current().settings,next);
  fail=true;maps.configure(defaultSettings);await new Promise(r=>setImmediate(r));release();await idle(maps);
  assert.equal(maps.current().settings.name,'Paris');assert.match(maps.status().error,/Existing map kept/);
});
test('offline geometry renders another country and dynamic HTML escapes labels and aligns annotations',async t=>{
  const directory=await fixture(t);
  const settings={...defaultSettings,name:'Paris <script>"',lat:48.8566,lon:2.3522,zoom:8.5,overviewZoom:5.5};
  await prepareMapAssets(settings,directory);
  const svg=await readFile(join(directory,'basemap.svg'),'utf8');
  const baseline=await readFile(new URL('../public/basemap.svg',import.meta.url),'utf8');
  assert.notEqual(svg,baseline);assert.match(svg,/<path d=/);assert.ok(!svg.includes('NaN'));
  const cities=JSON.parse(await readFile(join(directory,'places.json')));
  assert.ok(cities.length);assert.ok(!cities.some(c=>c.name==='Coventry'));
  const template=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const html=mapPage(template,{settings,id:mapId(settings)});
  assert.ok(!html.includes('{{'));assert.ok(html.includes('Paris &lt;script&gt;&quot;'));
  assert.ok(html.includes(`/maps/${mapId(settings)}/basemap.svg`));
  const {overviewRect,scale}=mapAnnotations(settings);
  assert.equal(overviewRect.width,1280/8);assert.equal(overviewRect.x,(390-160)/2);assert.ok(scale.pixels<=136);
  assert.equal(mapAnnotations(defaultSettings).scale.km,50);
});

test('archives and restart caches remain scoped to each centre and zoom',async t=>{
  const dir=await fixture(t),now=Date.now(),time=Math.floor(now/600000)*600;
  const tile=await sharp({create:{width:256,height:256,channels:4,background:'#126789'}}).png().toBuffer();
  const provider={getHistory:async()=>[{time}],getTile:async()=>tile};
  const first=await createRadar(dir,provider,{now:()=>now,settleMs:0});await first.refresh();
  assert.equal(first.archive.available().times.length,1);
  const views=makeViews({...defaultSettings,lat:48.8566,lon:2.3522});
  const second=await createRadar(dir,provider,{now:()=>now,settleMs:0,views,storageKey:'paris'});
  assert.equal(second.archive.available().times.length,0);assert.equal(second.status().frames.length,0);
  await second.refresh();
  assert.notEqual(first.status().frame.url,second.status().frame.url);
  const restored=await createRadar(dir,provider,{now:()=>now});
  assert.equal(restored.status().frame.url,first.status().frame.url);
  assert.equal(restored.archive.available().times.length,1);
});


test('new installations persist current defaults while implicit and saved installations retain their map and cache namespace',async t=>{
 const captured=[];
 const options={prepare:async()=>{},radarFactory:async(_d,_p,config)=>{captured.push(config);return {status:()=>({frames:[]})};}};
 const fresh=await fixture(t);
 const maps=await createMapSettings(fresh,options);
 assert.deepEqual(maps.current().settings,{name:'Coventry',lat:52.40801,lon:-1.51041,zoom:8,overviewZoom:5,timeZone:'Europe/London'});
 assert.deepEqual(JSON.parse(await readFile(join(fresh,'settings/map.json'),'utf8')),defaultSettings);
 assert.notEqual(captured.at(-1).storageKey,'');
 for(const marker of ['history.json','settling.json','maps']) {
   const old=await fixture(t);
   if(marker==='maps') await mkdir(join(old,'maps',mapId(legacyDefaultSettings)),{recursive:true});
   else await writeFile(join(old,marker),'[]');
   const restored=await createMapSettings(old,options);
   assert.deepEqual(restored.current().settings,legacyDefaultSettings);
   assert.equal(captured.at(-1).storageKey,'');
   assert.deepEqual(JSON.parse(await readFile(join(old,'settings/map.json'),'utf8')),legacyDefaultSettings);
   assert.deepEqual((await createMapSettings(old,options)).current().settings,legacyDefaultSettings);
 }
 for(const saved of [legacyDefaultSettings,{...defaultSettings,name:'Custom',lat:51.5,lon:-0.1,zoom:7,overviewZoom:4}]) {
   const existing=await fixture(t);
   await mkdir(join(existing,'settings'));
   const bytes=JSON.stringify(saved,null,2);
   await writeFile(join(existing,'settings/map.json'),bytes);
   assert.deepEqual((await createMapSettings(existing,options)).current().settings,saved);
   assert.equal(await readFile(join(existing,'settings/map.json'),'utf8'),bytes);
 }
});
