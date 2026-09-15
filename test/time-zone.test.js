import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {defaultSettings,validateMapSettings,mapAssetId,makeViews} from '../src/map.js';
import {createMapSettings,mapId} from '../src/map-settings.js';
import {mapPage} from '../src/map-page.js';
import {formatTime} from '../public/time.js';

test('legacy settings default to London; a zone-only save persists without preparing or fetching maps',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'radar-zone-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const {timeZone,...legacy}=defaultSettings;
  await mkdir(join(directory,'settings'));
  await writeFile(join(directory,'settings','map.json'),JSON.stringify(legacy));
  let preparations=0,factories=0;
  const radar={refresh:()=>{throw new Error('Unexpected acquisition');}};
  const options={prepare:async()=>{preparations++;},radarFactory:async()=>{factories++;return radar;}};
  const maps=await createMapSettings(directory,options);
  assert.deepEqual(maps.current().settings,defaultSettings);
  assert.equal(mapId(legacy),maps.current().id);
  const next={...defaultSettings,timeZone:'America/New_York'};
  assert.equal(maps.configure(next).status,202);
  for(let i=0;maps.status().busy&&i<100;i++) await new Promise(r=>setTimeout(r,5));
  assert.equal(maps.status().busy,false);
  assert.equal(maps.status().error,null);
  assert.equal(preparations,1);assert.equal(factories,1);
  assert.equal(maps.current().radar,radar);
  assert.notEqual(maps.current().id,mapId(defaultSettings));
  assert.equal(mapAssetId(next),mapAssetId(defaultSettings));
  assert.deepEqual(makeViews(next),makeViews(defaultSettings));
  assert.equal((await createMapSettings(directory,options)).current().settings.timeZone,'America/New_York');
  for(const invalid of ['',null,'Not/AZone','+03:00','<script>']) assert.throws(()=>validateMapSettings({...next,timeZone:invalid}));
  assert.equal(validateMapSettings({...next,timeZone:'UTC'}).timeZone,'UTC');
  const html=mapPage(await readFile(new URL('../public/index.html',import.meta.url),'utf8'),maps.current());
  assert.ok(!html.includes('{{'));
  assert.ok(html.includes('name="time-zone" content="America/New_York"'));
  assert.ok(html.includes(`/maps/${mapAssetId(defaultSettings)}/basemap.svg`));
});

test('time formatting follows local midnight, fractional offsets and daylight saving',()=>{
  const stamp=iso=>Date.parse(iso)/1000;
  const hm={hour:'2-digit',minute:'2-digit'};
  assert.equal(formatTime(stamp('2026-09-14T00:30:00Z'),{day:'numeric'},'America/New_York'),'13');
  assert.equal(formatTime(stamp('2026-09-14T00:30:00Z'),hm,'Asia/Kolkata'),'06:00');
  assert.equal(formatTime(stamp('2026-03-08T06:30:00Z'),hm,'America/New_York'),'01:30');
  assert.equal(formatTime(stamp('2026-03-08T07:30:00Z'),hm,'America/New_York'),'03:30');
  assert.equal(formatTime(stamp('2026-01-14T12:00:00Z'),hm,'Europe/London'),'12:00');
  assert.equal(formatTime(stamp('2026-07-14T12:00:00Z'),hm,'Europe/London'),'13:00');
});

test('history picker retains distinct epoch values for repeated local clock times',async()=>{
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const start=app.indexOf('const dayKey =');
  const end=app.indexOf("$('archive-day').addEventListener",start);
  const times=['2026-11-01T05:30:00Z','2026-11-01T06:30:00Z'].map(iso=>Date.parse(iso)/1000);
  const day={value:'01/11/2026'},select={replaceChildren(...options){this.options=options;}};
  const context=vm.createContext({archiveTimes:times,$:id=>id==='archive-day'?day:select,
    format:(time,options)=>formatTime(time,options,'America/New_York'),
    Option:function(label,value){this.label=label;this.value=value;}});
  vm.runInContext(app.slice(start,end)+'\npopulateTimes();',context);
  assert.equal(select.options.length,2);
  assert.ok(select.options.every(o=>o.label.startsWith('01:30')));
  assert.notEqual(select.options[0].label,select.options[1].label);
  assert.deepEqual(select.options.map(o=>o.value),times.map(String));
});
