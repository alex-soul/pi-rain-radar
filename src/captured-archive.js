import { readFile, writeFile, rename, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { HISTORY_SECONDS, CLEANUP_BUFFER_SECONDS, HISTORY_DAYS } from './archive.js';

const framePath = /^\/frames\/\d+-[a-f0-9]{12}\.png$/;
export async function createCapturedArchive(directory, identity, { now = Date.now, legacyViews } = {}) {
  const file = join(directory, `captured-${identity}.json`);
  let entries = new Map(), revision = 0, writing = Promise.resolve();
  const cutoff = () => Math.floor(now()/1000) - HISTORY_SECONDS - CLEANUP_BUFFER_SECONDS;
  const valid = f => Number.isSafeInteger(f?.time) && f.time > 0 && f.time % 600 === 0 &&
    [f.url,f.overviewUrl].every(url => url === null || (typeof url === 'string' && framePath.test(url))) &&
    (f.url || f.overviewUrl) && ['rainviewer','rainbow',null].includes(f.source) && ['rainviewer','rainbow',null].includes(f.overviewSource);
  try {
    const saved = JSON.parse(await readFile(file,'utf8'));
    if (!Array.isArray(saved) || saved.length > 1100 || !saved.every(valid)) throw new Error();
    entries = new Map(saved.filter(f => f.time >= cutoff()).map(f=>[f.time,f]));
  } catch(e) {
    if(e.code !== 'ENOENT') throw new Error('Captured history is invalid. Restore the captured history index.');
    if(legacyViews) {
      const files = new Set(await readdir(directory));
      for(const name of files) {
        const match = name.match(/^(\d+)-([a-f0-9]{12})\.png$/);
        if(match && match[2] === legacyViews.viewKey && files.has(`${match[1]}-${legacyViews.overviewKey}.png`)) {
          const time = Number(match[1]);
          const entry = {time,url:`/frames/${name}`,overviewUrl:`/frames/${time}-${legacyViews.overviewKey}.png`,source:'rainviewer',overviewSource:'rainviewer',mainTime:time,overviewTime:time};
          if(valid(entry) && time >= cutoff()) entries.set(time,entry);
        }
      }
    }
  }
  function values() { return [...entries.values()].sort((a,b)=>a.time-b.time); }
  async function persist() {
    const body=JSON.stringify(values());
    const task=writing.then(async()=>{await writeFile(file+'.tmp',body);await rename(file+'.tmp',file);});
    writing=task.catch(()=>{});await task;
  }
  return {
    revision:()=>revision, cutoff,
    frames:()=>values(),
    async capture(frame) {
      if(!valid(frame)) return;
      if(JSON.stringify(entries.get(frame.time))===JSON.stringify(frame)) return;
      const prior=entries; entries=new Map(entries);entries.set(frame.time,frame);
      for(const time of entries.keys())if(time<cutoff())entries.delete(time);
      try { await persist(); revision++; } catch(e) { entries=prior;throw e; }
    },
    available:()=>({times:values().filter(f=>f.time>=now()/1000-HISTORY_SECONDS+7200&&f.time<=now()/1000).map(f=>f.time),retentionDays:HISTORY_DAYS}),
    window(end,hours=2) {
      if(![2,4,6].includes(hours)||!entries.has(end))return null;
      const start=end-hours*3600,frames=values().filter(f=>f.time>=start&&f.time<=end);
      return {start,end,frames,complete:frames.length===hours*6+1};
    },
  };
}

// Protect every retained capture, including an older observation retained during
// an outage. Cleanup is shared, never performed by competing per-view workers.
export async function cleanupCaptured(directory, now = Date.now) {
  const cutoff=Math.floor(now()/1000)-HISTORY_SECONDS-CLEANUP_BUFFER_SECONDS;
  const files=await readdir(directory),keep=new Set();
  for(const file of files.filter(f=>/^captured-[a-f0-9]{12}\.json$/.test(f))) {
    const entries=JSON.parse(await readFile(join(directory,file),'utf8'));
    // Original capture evidence is retained for migration rollback, including uncertain timestamps.
    for(const frame of entries)for(const url of [frame.url,frame.overviewUrl])if(url&&framePath.test(url))keep.add(url.slice('/frames/'.length));
  }
  for(const file of files.filter(f=>/^observations-[a-f0-9]{12}\.json$/.test(f))) {
    const saved=JSON.parse(await readFile(join(directory,file),'utf8'));
    if(saved.version!==1||!Array.isArray(saved.observations))throw new Error('Invalid observation index; cleanup stopped.');
    for(const frame of saved.observations)if(frame.time>=cutoff&&framePath.test(frame.url))keep.add(frame.url.slice('/frames/'.length));
  }
  for(const file of files)if(/^\d+-[a-f0-9]{12}\.png$/.test(file)&&Number(file.split('-')[0])<cutoff&&!keep.has(file))await unlink(join(directory,file));
  for(const file of files)if(file.endsWith('.tmp')&&now()-(await stat(join(directory,file))).mtimeMs>3600000)await unlink(join(directory,file));
}
