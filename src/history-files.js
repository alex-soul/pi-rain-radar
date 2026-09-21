import {mkdir,open,readFile,rename,stat,lstat,unlink,opendir,statfs,rmdir} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';

export const archiveError=(code,message)=>Object.assign(new Error(message),{code});
export async function exists(path) {try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function readJson(path) {
  const info=await stat(path);
  if(info.size>1024*1024)throw archiveError('ARCHIVE_STATE','Archive state is too large');
  return JSON.parse(await readFile(path,'utf8'));
}
export async function syncDirectory(path) {
  // Windows does not expose POSIX directory fsync. File data is still synced.
  if(process.platform==='win32')return;
  const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}
}
export async function atomicJson(path,value) {
  const handle=await open(path+'.tmp','w',0o600);
  try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
  await rename(path+'.tmp',path);
  await syncDirectory(resolve(path,'..'));
}
export function ownedPath(root,path) {
  const destination=resolve(root,path),rel=relative(root,destination);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw archiveError('ARCHIVE_PATH','Invalid archive path');
  return destination;
}
export async function regularFile(path) {
  const info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink())throw archiveError('ARCHIVE_PATH','Archive asset is not a regular file');
  return info;
}
export async function diskSpace(path) {
  const s=await statfs(path);
  return {capacity:s.blocks*s.bsize,available:s.bavail*s.bsize};
}
export function reserveBytes(capacity) {
  const MiB=1024*1024;
  // One 8 MiB incoming asset + its temporary copy and bounded WAL allowance.
  return Math.max(Math.min(512*MiB,Math.max(32*MiB,capacity*.02)),64*MiB);
}

export async function preserveWeather(directory) {
  const path=join(directory,'weather.json');
  if(!await exists(path))return;
  const target=join(directory,'settings','weather-operational.json');
  if(await exists(target))return;
  const original=await readJson(path),saved={version:1};
  for(const key of ['location','nextAttemptAt','nextSetupAt','failures','error','forecastError'])
    if(Object.hasOwn(original,key))saved[key]=original[key];
  await mkdir(join(directory,'settings'),{recursive:true,mode:0o700});
  await atomicJson(target,saved);
}

export const legacyOwned = name => /^(?:\d+-[a-f0-9]{12}\.png|(?:observations|captured)-[a-f0-9]{12}\.json|(?:history|settling)(?:-(?:(?:rainviewer|rainbow)-)?[a-f0-9]{12})?\.json|current\.json|weather\.json)(?:\.tmp)?$/.test(name);

// A resumable bounded iterator, used only for the explicitly authorized reset.
// No recursive deletion and no traversal of settings/maps/unknown directories.
export async function* legacyFiles(directory) {
  const dir=await opendir(directory);
  for await(const item of dir)yield item.isFile()&&legacyOwned(item.name)?join(directory,item.name):null;
}

// Recovery media has timestamped filenames and hourly shards. Only our own
// generated hierarchy is traversed, never symlinks or arbitrary user paths.
export async function* mediaFiles(root,generation,firstTime,lastTime) {
  if(!Number.isSafeInteger(firstTime)||!Number.isSafeInteger(lastTime))return;
  for(let hour=Math.floor(firstTime/3600000);hour<=Math.floor(lastTime/3600000);hour++){
    const folder=join(root,'media',generation,String(hour));
    if(!await exists(folder)){yield null;continue;}
    const dir=await opendir(folder),names=[];
    for await(const item of dir){
      if(item.isFile()&&/^\d+-[a-f0-9-]+\.(?:png|jpg|webp)(?:\.tmp)?$/.test(item.name))names.push(item.name);
      if(names.length>2048)throw archiveError('ARCHIVE_STATE','Recovery media shard exceeds its bound');
    }
    names.sort((a,b)=>Number(a.split('-')[0])-Number(b.split('-')[0])||a.localeCompare(b));
    for(const name of names)yield join(folder,name);
    yield null;
  }
}
export async function removeFile(path) {try{await regularFile(path);await unlink(path);}catch(e){if(e.code!=='ENOENT')throw e;}}

export async function acquireLease(root,token) {
  const guard=join(root,'owner-claim'),path=join(root,'owner.json');
  try{await mkdir(guard);}catch(e){if(e.code==='EEXIST')throw archiveError('ARCHIVE_OPEN','Archive ownership claim needs inspection');throw e;}
  try{
    if(await exists(path)){
      const owner=await readJson(path);
      if(!Number.isSafeInteger(owner.pid)||owner.pid<1)throw archiveError('ARCHIVE_STATE','Invalid archive owner');
      let live=true;try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH')live=false;}
      // Container/host restarts can reuse the same PID. Compare Linux process
      // start ticks rather than mistaking our new process for its dead ancestor.
      if(live&&owner.start&&process.platform==='linux')live=owner.start===await processStart(owner.pid);
      if(live)throw archiveError('ARCHIVE_OPEN','Archive is owned by another running process');
    }
    await atomicJson(path,{pid:process.pid,token,start:await processStart(process.pid)});
  }finally{await rmdir(guard);}
}
async function processStart(pid) {
  if(process.platform!=='linux')return null;
  try{
    const data=await readFile(`/proc/${pid}/stat`,'utf8');
    const ticks=data.slice(data.lastIndexOf(')')+2).split(' ')[19];
    return (await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim()+':'+ticks;
  }catch(e){if(e.code==='ENOENT'||e.code==='ESRCH')return null;throw e;}
}
export async function releaseLease(root,token) {
  const path=join(root,'owner.json');
  try{const owner=await readJson(path);if(owner.token===token)await unlink(path);}catch(e){if(e.code!=='ENOENT')throw e;}
}
