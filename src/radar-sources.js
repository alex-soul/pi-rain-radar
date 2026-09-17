import { createRadar } from './radar.js';
import { createCapturedArchive, cleanupCaptured } from './captured-archive.js';
import { hash } from './map.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createRadarSources(directory, providers, {
  views, now = Date.now, waitForSettle, selection, onEvent = ()=>{}, historyDepth=13,
} = {}) {
  const archive=await createCapturedArchive(directory,hash(views),{now,legacyViews:views});
  let bootstrapPending=archive.frames().length===0;
  const workers=new Map();let busy=false,changing=false,storageError=null,capturing=Promise.resolve();
  const providerSeen=new Map();
  // Restore the earliest observation across both views, including inactive ones.
  // A successfully composed frame has already passed that provider's settling gate.
  for(const source of ['rainviewer','rainbow']) {
    const seen=new Map();providerSeen.set(source,seen);
    for(const originalKey of [views.viewKey,views.overviewKey]) {
      const key=source==='rainviewer'?originalKey:hash({source,originalKey});
      try {
        const pending=JSON.parse(await readFile(join(directory,`settling-${source}-${key}.json`),'utf8'));
        for(const [time,at] of pending)if(Number.isSafeInteger(time)&&Number.isFinite(at)&&at<=now())seen.set(time,Math.min(seen.get(time)??Infinity,at));
      }catch{/* Missing or invalid state starts a fresh settling period. */}
      try {
        const saved=JSON.parse(await readFile(join(directory,`history-${source}-${key}.json`),'utf8'));
        if(saved.viewKey===key)for(const frame of saved.frames)if(Number.isSafeInteger(frame.time))seen.set(frame.time,Math.min(seen.get(frame.time)??Infinity,now()-300000));
      }catch{/* A missing view cache does not block the other view. */}
    }
  }
  let current={...selection()}, activeWorkers={};
  const resolved=s=>({main:s.main,overview:s.overview==='same'?s.main:s.overview});
  // Share a manifest and bounded tile promises across the two views per cycle.
  let metadata=new Map(),tiles=new Map();
  function resetRequests(){metadata=new Map();tiles=new Map();}
  async function worker(source,slot) {
    const target=slot==='main'?views.view:views.overviewView;
    const originalKey=slot==='main'?views.viewKey:views.overviewKey;
    const key=source==='rainviewer'?originalKey:hash({source,originalKey});
    const id=`${source}-${key}`;
    if(!workers.has(id)) {
      const provider={
        getHistory(){
          if(!metadata.has(source))metadata.set(source,Promise.resolve().then(()=>providers[source].getHistory()).then(frames=>{
            const seen=providerSeen.get(source),observedAt=now(),selected=frames.slice(-historyDepth);
            const listed=new Set(selected.map(frame=>frame.time));
            for(const time of seen.keys())if(!listed.has(time))seen.delete(time);
            for(const frame of selected)if(!seen.has(frame.time))seen.set(frame.time,observedAt);
            return selected.map(frame=>({...frame,firstSeenAt:seen.get(frame.time)}));
          }));
          return metadata.get(source);
        },
        getTile(frame,tile){
          const tileKey=`${source}:${frame.time}:${tile.zoom}:${tile.x}:${tile.y}`;
          if(!tiles.has(tileKey))tiles.set(tileKey,Promise.resolve().then(()=>providers[source].getTile(frame,tile)));
          return tiles.get(tileKey);
        },
      };
      workers.set(id,await createRadar(directory,provider,{now,waitForSettle,manageCleanup:false,storageKey:id,views:{view:target,viewKey:key,overviewView:target,overviewKey:key}}));
    }
    return workers.get(id);
  }
  async function prepare(s){const sources=resolved(s);return {main:await worker(sources.main,'main'),overview:await worker(sources.overview,'overview')};}
  activeWorkers=await prepare(current);
  const latest=slot=>activeWorkers[slot]?.status().frame;
  function capture(seed=false) {
    const task=capturing.then(async()=>{
    // Seed a fresh live playback window from the observations just acquired.
    // Existing captures are never replaced by a different provider's backfill.
    if(seed&&bootstrapPending){
      const mainFrames=activeWorkers.main.status().frames,overviewFrames=activeWorkers.overview.status().frames;
      const sources=resolved(current),times=[...new Set([...mainFrames,...overviewFrames].map(f=>f.time))].sort((a,b)=>a-b);
      for(const time of times){
        if(archive.frames().some(frame=>frame.time===time))continue;
        const main=mainFrames.findLast(f=>f.time<=time),overview=overviewFrames.findLast(f=>f.time<=time);
        await archive.capture({time,url:main?.url??null,overviewUrl:overview?.url??null,source:main?sources.main:null,overviewSource:overview?sources.overview:null,mainTime:main?.time??null,overviewTime:overview?.time??null});
      }
      bootstrapPending=false;
    }
    const main=latest('main'),overview=latest('overview'),sources=resolved(current);
    if(!main&&!overview)return;
    await archive.capture({time:Math.floor(now()/600000)*600,url:main?.url??null,overviewUrl:overview?.url??null,
      source:main?sources.main:null,overviewSource:overview?sources.overview:null,mainTime:main?.time??null,overviewTime:overview?.time??null});
    });capturing=task.catch(()=>{});return task;
  }
  function sourceStatus(slot) {
    const source=resolved(current)[slot],state=activeWorkers[slot].status(),provider=providers[source].status?.();
    const frame=state.frame;
    const error=provider?.error||state.error;
    return {source,time:frame?.time??null,fetching:state.fetching,error,
      state:error?'warning':!frame?'waiting':frame.time<now()/1000-1800?'stale':'ready'};
  }
  return {
    archive,
    async refresh() {
      if(busy||changing)return;busy=true;resetRequests();
      try {
        // A view publishes independently as soon as its own acquisition finishes.
        await Promise.all(Object.entries(activeWorkers).map(async([,worker])=>{await worker.refresh();await capture();}));
        await capture(true);
        storageError=null;await cleanupCaptured(directory,now);
      } catch {storageError='Could not save radar history.';onEvent('storage-error');}
      finally {busy=false;tiles.clear();}
      if(['main','overview'].some(slot=>sourceStatus(slot).state!=='ready'))onEvent('radar-error');
    },
    async configure(next, commit) {
      if(busy||changing)return {status:409,error:'Radar is updating. Please try again shortly.'};
      changing=true;resetRequests();
      try {
        const candidate=await prepare(next);
        await Promise.all(Object.values(candidate).map(w=>w.refresh()));
        if(Object.values(candidate).some(w=>!w.status().frame||w.status().error))return {status:503,error:'The selected sources are not ready. Your previous sources remain active; try again shortly.'};
        await commit();current={...next};activeWorkers=candidate;
        try{await capture(true);}catch{storageError='Could not save radar history.';onEvent('storage-error');}
        return {status:200};
      }catch{return {status:503,error:'Could not apply radar sources. Check Status and try again.'};}
      finally{changing=false;tiles.clear();}
    },
    status() {
      const all=archive.frames(),end=all.at(-1)?.time??0,frames=all.filter(f=>f.time>=end-7200).slice(-13);
      const sources={main:sourceStatus('main'),overview:sourceStatus('overview')};
      return {frames,frame:frames.at(-1)??null,sources,error:storageError||Object.values(sources).find(s=>s.error)?.error||null,
        fetching:busy||changing,progress:null,view:views.view};
    },
  };
}
