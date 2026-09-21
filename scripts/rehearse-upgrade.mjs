// Docker-only disposable upgrade/restore rehearsal. Both image references are
// explicit arguments. Retains stopped containers and named volumes as evidence.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
const [legacy,candidate]=process.argv.slice(2);if(!legacy||!candidate)throw Error('Supply legacy and candidate image references');
const exec=promisify(execFile),prefix='radar-upgrade-'+randomUUID().slice(0,8),containers=[];
async function docker(...args){return (await exec('docker',args,{maxBuffer:1024*1024,windowsHide:true})).stdout.trim();}
const volume=prefix+'-data',backup=prefix+'-backup',restored=prefix+'-restore';
for(const v of [volume,backup,restored])await docker('volume','create',v);
const helper=(mounts,code)=>docker('run','--rm','--network','none',...mounts.flatMap(m=>['-v',m]),candidate,'node','--input-type=module','-e',code);
const end=Number(await helper([volume+':/data'],`
import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';import sharp from 'sharp';import {defaultSettings,defaultViews} from './src/map.js';
await mkdir('/data/settings',{recursive:true});await writeFile('/data/settings/map.json',JSON.stringify({...defaultSettings,name:'Upgrade rehearsal'}));
await writeFile('/data/settings/backup-probe.json','synthetic-preserved');
const end=Math.floor(Date.now()/600000)*600;
for(const [view,key] of [[defaultViews.view,defaultViews.viewKey],[defaultViews.overviewView,defaultViews.overviewKey]]){
 const image=await sharp({create:{width:view.width,height:view.height,channels:4,background:'#00000000'}}).png().toBuffer();
 for(let i=0;i<=12;i++)await writeFile(join('/data',end-i*600+'-'+key+'.png'),image);
}console.log(end);
`));
async function start(name,image,v){
  await docker('run','-d','--name',name,'--network','none','-e','RADAR_MANUAL_REFRESH=1','-v',v+':/data',image);containers.push(name);
  for(let i=0;i<60;i++){try{await docker('exec',name,'node','-e',`fetch('http://localhost:3000/healthz').then(async r=>{if(!r.ok||!(await r.json()).ok)process.exit(1)}).catch(()=>process.exit(1))`);return;}catch{await new Promise(r=>setTimeout(r,500));}}
  throw Error('Rehearsal startup failed: '+name);
}
const check=(name,code)=>docker('exec',name,'node','--input-type=module','-e',code);
const oldCheck=`import assert from 'node:assert/strict';import fs from 'node:fs';const response=await fetch('http://localhost:3000/api/archive?end=${end}&hours=2');assert.equal(response.status,200);const data=await response.json();assert.equal(data.frames.length,13);for(const f of data.frames)assert.equal((await fetch('http://localhost:3000'+f.url)).status,200);assert.equal(fs.readFileSync('/data/settings/backup-probe.json','utf8'),'synthetic-preserved');console.log(JSON.stringify({frames:data.frames.length,settingsPreserved:true}));`;
try{
  await start(prefix+'-old',legacy,volume);console.log('legacy '+await check(prefix+'-old',oldCheck));await docker('stop',prefix+'-old');
  // Complete consistent copy with every writer stopped. The source is read-only.
  await helper([volume+':/source:ro',backup+':/data'],`import {cp} from 'node:fs/promises';await cp('/source','/data',{recursive:true});`);
  await start(prefix+'-new',candidate,volume);
  const newCheck=`import fs from 'node:fs';import assert from 'node:assert/strict';const status=await(await fetch('http://localhost:3000/api/status')).json();assert.equal(status.appVersion,'0.7.0-rc.1');assert.equal((await fetch('http://localhost:3000/api/archive?end=${end}&hours=2')).status,404);assert.equal(fs.readFileSync('/data/settings/backup-probe.json','utf8'),'synthetic-preserved');const state=JSON.parse(fs.readFileSync('/data/archive/state.json'));console.log(JSON.stringify({version:status.appVersion,generation:state.generation,settingsPreserved:true}));`;
  const first=await check(prefix+'-new',newCheck);await docker('restart',prefix+'-new');
  for(let i=0;i<60;i++){try{const again=await check(prefix+'-new',newCheck);if(again!==first)throw Error('Reset repeated');console.log('candidate '+again);break;}catch(error){if(i===59)throw error;await new Promise(r=>setTimeout(r,500));}}
  await docker('stop',prefix+'-new');
  await helper([backup+':/source:ro',restored+':/data'],`import {cp} from 'node:fs/promises';await cp('/source','/data',{recursive:true});`);
  await start(prefix+'-restored',legacy,restored);console.log('restored '+await check(prefix+'-restored',oldCheck));
  console.log(JSON.stringify({prefix,legacy,candidate,volume,backup,restored,passed:true}));
}finally{for(const name of containers)await docker('stop',name).catch(()=>{});}
