import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,cp,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createArchive} from '../src/archive.js';
import {createHistoryStore} from '../src/history-store.js';

async function manifest(root,relative=''){
  const result={};
  for(const entry of await readdir(join(root,relative),{withFileTypes:true})){
    const path=join(relative,entry.name);
    if(entry.isDirectory())Object.assign(result,await manifest(root,path));
    else result[path]=createHash('sha256').update(await readFile(join(root,path))).digest('hex');
  }
  return result;
}
test('stopped-writer complete backups restore legacy playback and new DB/media/settings independently',async t=>{
  const root=await mkdtemp(join(tmpdir(),'radar-backup-rehearsal-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const original=join(root,'original'),legacyBackup=join(root,'legacy-backup'),legacyRestore=join(root,'legacy-restore'),newBackup=join(root,'new-backup'),newRestore=join(root,'new-restore');
  await mkdir(join(original,'settings'),{recursive:true});
  const settings=JSON.stringify({apiKey:'synthetic-only',quota:17});
  await writeFile(join(original,'settings','rainbow-usage.json'),settings);
  const now=Math.floor(Date.now()/600000)*600000,main='123456abcdef',overview='abcdef123456';
  const bytes=await sharp({create:{width:1920,height:1080,channels:3,background:'#31564d'}}).jpeg().toBuffer();
  const png=await sharp(bytes).png().toBuffer();
  for(let i=0;i<=12;i++)for(const key of [main,overview])await writeFile(join(original,`${now/1000-i*600}-${key}.png`),png);
  await writeFile(join(original,'weather.json'),JSON.stringify({nextAttemptAt:now+600000,data:{current:{time:now/1000,tempC:12}}}));
  // No writer exists during either complete-directory copy. A DB-only copy
  // would omit immutable images and cannot satisfy these assertions.
  await cp(original,legacyBackup,{recursive:true,errorOnExist:true,force:false});
  const legacyHashes=await manifest(legacyBackup);assert.deepEqual(await manifest(original),legacyHashes);
  let store=await createHistoryStore(original,{now});
  await store.maintain();
  assert.equal((await store.status()).records,0);
  await store.publish({kind:'camera',source:'fixture',context:'fixture',time:now,receivedAt:now,basis:'acquisition',data:{name:'Synthetic camera'}},bytes);
  await store.put([{kind:'weather',source:'openweather',context:'here',time:now,receivedAt:now,data:{tempC:12}}]);
  const generation=(await store.status()).generation;await store.close();
  await cp(original,newBackup,{recursive:true,errorOnExist:true,force:false});
  assert.deepEqual(await manifest(newBackup),await manifest(original));
  await cp(newBackup,newRestore,{recursive:true,errorOnExist:true,force:false});
  store=await createHistoryStore(newRestore,{now});
  try{
    const status=await store.status();assert.equal(status.generation,generation);assert.equal(status.records,2);
    const camera=await store.latest({kind:'camera',start:now-600000,end:now});
    assert.deepEqual(await readFile(join(newRestore,'archive',camera.asset)),bytes);
    assert.equal(await readFile(join(newRestore,'settings','rainbow-usage.json'),'utf8'),settings);
  }finally{await store.close();}
  await cp(legacyBackup,legacyRestore,{recursive:true,errorOnExist:true,force:false});
  const legacy=await createArchive(legacyRestore,main,overview,()=>now);
  assert.equal(legacy.window(now/1000,2).frames.length,13);
  assert.deepEqual(await manifest(legacyRestore),legacyHashes);
  assert.deepEqual(await manifest(legacyBackup),legacyHashes,'upgrade never changes protected legacy backup');
});
