import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMapSettings} from '../src/map-settings.js';
import {defaultSettings,mapAssetId} from '../src/map.js';
import {prepareMapAssets} from '../src/map-assets.js';

test('preview is bounded, offline, non-publishing and reused by Apply',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'radar-preview-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  let preparations=0,acquisitions=0,changes=0,hold=null,fail=false;
  const maps=await createMapSettings(directory,{
    prepare:async(...args)=>{preparations++;if(hold)await hold;if(fail)throw Error('test');await prepareMapAssets(...args);},
    radarFactory:async()=>({refresh:async()=>{acquisitions++;},status:()=>({frames:[{time:123}]})}),
    onChange:()=>{changes++;},
  });
  const original=maps.current();
  const originalSettings=await readFile(join(directory,'settings','map.json'),'utf8');
  const next={...defaultSettings,name:'Paris <script>',lat:48.8566,lon:2.3522};
  let release;hold=new Promise(r=>release=r);
  const request=maps.preview({...next,theme:'dark'});
  assert.equal((await maps.preview(next)).status,409);
  assert.equal(maps.configure(next).status,409);
  release();hold=null;
  const preview=await request;
  assert.equal(preview.status,200);
  assert.doesNotMatch(preview.main, /N ↑|>[^<]* km<|map-scale/);
  assert.match(preview.main,/Paris &lt;script&gt;/);
  assert.ok(!preview.main.includes('<script>'));
  assert.match(preview.overview,/stroke-dasharray="3 3"/);
  assert.match(preview.main,/#111d26/);
  assert.equal(maps.current().id,original.id);
  assert.equal(maps.current().radar,original.radar);
  assert.equal(acquisitions,0);assert.equal(changes,0);
  assert.equal(await readFile(join(directory,'settings','map.json'),'utf8'),originalSettings);
  const light=await maps.preview({...next,theme:'light'});
  assert.equal(light.status,200);assert.match(light.main,/#d7e8ed/);
  assert.equal(preparations,2);
  assert.deepEqual(await readdir(join(directory,'maps')),[mapAssetId(defaultSettings)]);
  assert.equal(maps.configure(next).status,202);
  for(let i=0;maps.status().busy&&i<100;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(maps.status().busy,false);assert.equal(maps.status().error,null);
  assert.equal(preparations,2);assert.equal(acquisitions,1);assert.equal(changes,1);
  assert.deepEqual(JSON.parse(await readFile(join(directory,'settings','map.json'))),next);
  fail=true;
  assert.equal((await maps.preview({...next,zoom:9})).status,503);
  assert.equal(maps.current().settings.zoom,8);
  assert.equal(maps.status().busy,false);
  assert.equal((await maps.preview({...next,lat:100})).status,400);
});
