import { createRadar } from './radar.js';
import { cleanupCaptured } from './captured-archive.js';
import { createObservationArchive } from './observation-archive.js';
import { hash } from './map.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createRadarSources(directory, providers, {
  views, now = Date.now, waitForSettle, selection, onEvent = ()=>{}, historyDepth=13, nextRefreshAt = () => now() + 300000,
} = {}) {
  const archive=await createObservationArchive(directory,views,{now,selection:selection()});
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
      workers.set(id,await createRadar(directory,provider,{now,waitForSettle,nextRefreshAt,manageCleanup:false,onEvent:code=>{if(code==='radar-error'||code==='radar-recovered')onEvent(code);},onObservation:r=>archive.add([{...r,source,key}]),storageKey:id,views:{view:target,viewKey:key,overviewView:target,overviewKey:key}}));
    }
    return workers.get(id);
  }
  async function prepare(s){const sources=resolved(s);return {main:await worker(sources.main,'main'),overview:await worker(sources.overview,'overview')};}
  activeWorkers=await prepare(current);
  function capture() {
    const task=capturing.then(async()=>{
      await archive.select(current);
      const observations=[];
      for(const [id,worker] of workers) {
        const source=id.slice(0,id.indexOf('-')),key=id.slice(id.indexOf('-')+1);
        // Include every locally acquired observation, not just the latest image.
        for(const frame of worker.observations()) observations.push({time:frame.time,source,key,url:frame.url,arrivedAt:frame.arrivedAt});
      }
      await archive.add(observations);
    });capturing=task.catch(()=>{});return task;
  }
  function sourceStatus(slot) {
    const source=resolved(current)[slot],state=activeWorkers[slot].status(),provider=providers[source].status?.();
    const frame=state.frame;
    const error=provider?.error||state.error;
    return {source,time:frame?.time??null,checkedAt:state.checkedAt,nextCheckAt:nextRefreshAt(),nextUpdate:state.nextUpdate,fetching:state.fetching,error,
      state:error?'warning':!frame?'waiting':frame.time<now()/1000-1800?'stale':'ready'};
  }
  return {
    archive,
    observe: () => archive.observe().catch(()=>{storageError='Could not save radar history.';onEvent('storage-error');}),
    async refresh() {
      if(busy||changing)return;busy=true;resetRequests();
      try {
        // A view publishes independently as soon as its own acquisition finishes.
        await Promise.all(Object.entries(activeWorkers).map(async([,worker])=>{await worker.refresh();await capture();}));
        await capture();
        storageError=null;await cleanupCaptured(directory,now);
      } catch {storageError='Could not save radar history.';onEvent('storage-error');}
      finally {busy=false;tiles.clear();}
    },
    async configure(next, commit) {
      if(busy||changing)return {status:409,error:'Radar is updating. Please try again shortly.'};
      changing=true;resetRequests();
      try {
        const candidate=await prepare(next);
        await Promise.all(Object.values(candidate).map(w=>w.refresh()));
        if(Object.values(candidate).some(w=>!w.status().frame||w.status().error))return {status:503,error:'The selected sources are not ready. Your previous sources remain active; try again shortly.'};
        await commit();current={...next};activeWorkers=candidate;
        try{await capture();}catch{storageError='Could not save radar history.';onEvent('storage-error');}
        return {status:200};
      }catch{return {status:503,error:'Could not apply radar sources. Check Status and try again.'};}
      finally{changing=false;tiles.clear();}
    },
    healthSources: () => ({main:sourceStatus('main'),overview:sourceStatus('overview')}),
    status(hours=2) {
      const live=archive.live(hours),frames=live.frames;
      const sources={main:sourceStatus('main'),overview:sourceStatus('overview')};
      return {...live,frames,frame:frames.at(-1)??null,sources,error:storageError||Object.values(sources).find(s=>s.error)?.error||null,
        fetching:busy||changing,progress:null,view:views.view};
    },
  };
}
