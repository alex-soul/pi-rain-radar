import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {prepareMapAssets,assetNames} from '../src/map-assets.js';
import {defaultSettings,makeViews} from '../src/map.js';
test('existing map assets gain richer town candidates without rewriting any legacy asset',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-label-migration-'));
  try{
    const old=assetNames.filter(n=>n!=='places-candidates.json').concat('ready.json');
    for(const name of old)await writeFile(join(dir,name),'Existing '+name+'\n');
    const geometry=JSON.stringify(makeViews(defaultSettings));
    await prepareMapAssets(defaultSettings,dir);
    for(const name of old)assert.equal(await readFile(join(dir,name),'utf8'),'Existing '+name+'\n');
    const candidates=JSON.parse(await readFile(join(dir,'places-candidates.json'),'utf8'));
    assert.ok(candidates.length>50);assert.ok(candidates.every(p=>p.name&&p.position.every(Number.isFinite)));
    assert.equal(JSON.stringify(makeViews(defaultSettings)),geometry);
  }finally{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('radar-label-migration-'));await rm(dir,{recursive:true,force:true});}
});
