import {resolveRadarSources,maskLiveRadar} from '../public/radar-policy.js';
import {createRadarHistory,radarPersistence} from './radar-history.js';
import { createRadar } from './radar.js';
import { hash } from './map.js';

export async function createRadarSources(directory, providers, {
  store, views, now = Date.now, waitForSettle, selection, enabled=()=>true, onEvent = ()=>{}, historyDepth=13, nextRefreshAt = () => now() + 300000,
} = {}) {
  const archive=await createRadarHistory(store,views,{now,selection:selection()});
  const workers=new Map();let busy=false,changing=false,storageError=null,capturing=Promise.resolve();
  const providerSeen=new Map();
  for(const source of ['rainviewer','rainbow'])providerSeen.set(source,new Map());
  let current={...selection()}, activeWorkers={};
  const resolved=resolveRadarSources;
  const collecting=source=>source!=='disabled'&&enabled(source);
  // Share a manifest and bounded tile promises across the two views per cycle.
  let metadata=new Map(),tiles=new Map();
  function resetRequests(){metadata=new Map();tiles=new Map();}
  async function worker(source,slot) {
    if(source==='disabled')return {refresh:async()=>{},status:()=>({frame:null,fetching:false}),observations:()=>[]};
    const target=slot==='main'?views.view:views.overviewView;
    const originalKey=slot==='main'?views.viewKey:views.overviewKey;
    const key=source==='rainviewer'?originalKey:hash({source,originalKey});
    const id=`${source}-${key}-${slot}`;
    if(!workers.has(id)) {
      const provider={
        getHistory(){
          if(!collecting(source))return Promise.resolve([]);
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
          if(!collecting(source))throw Error('Radar collection disabled');
          const tileKey=`${source}:${frame.time}:${tile.zoom}:${tile.x}:${tile.y}`;
          if(!tiles.has(tileKey))tiles.set(tileKey,Promise.resolve().then(()=>providers[source].getTile(frame,tile)));
          return tiles.get(tileKey);
        },
      };
      const persistence=await radarPersistence(store,directory,{context:archive.context,source,role:slot,now});
      if(persistence)for(const [time,at] of persistence.settling)providerSeen.get(source).set(time,Math.min(providerSeen.get(source).get(time)??Infinity,at));
      workers.set(id,await createRadar(directory,provider,{persistence,now,waitForSettle,nextRefreshAt,manageCleanup:false,onEvent:code=>{if(code==='radar-error'||code==='radar-recovered')onEvent(code);},onObservation:r=>archive.add([{...r,source,key}]),storageKey:id,views:{view:target,viewKey:key,overviewView:target,overviewKey:key}}));
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
    const source=resolved(current)[slot],state=activeWorkers[slot].status(),provider=providers[source]?.status?.();
    const frame=state.frame;
    const error=collecting(source)?provider?.error||state.error:null;
    return {source,time:frame?.time??null,checkedAt:state.checkedAt,nextCheckAt:nextRefreshAt(),nextUpdate:state.nextUpdate,fetching:state.fetching,error,
      enabled:collecting(source),state:!collecting(source)?'disabled':error?'warning':!frame?'waiting':frame.time<now()/1000-1800?'stale':'ready'};
  }
  return {
    archive,
    protection:()=>({context:archive.context,...resolved(current)}),
    observe: () => archive.observe().catch(()=>{storageError='Could not save radar history.';onEvent('storage-error');}),
    async refresh() {
      if(busy||changing)return;busy=true;resetRequests();
      try {
        // A view publishes independently as soon as its own acquisition finishes.
        await Promise.all(Object.entries(activeWorkers).map(async([slot,worker])=>{if(collecting(resolved(current)[slot]))await worker.refresh();await capture();}));
        await capture();
        storageError=null;
      } catch {storageError='Could not save radar history.';onEvent('storage-error');}
      finally {busy=false;tiles.clear();}
    },
    async configure(next, commit) {
      if(busy||changing)return {status:409,error:'Radar is updating. Please try again shortly.'};
      changing=true;resetRequests();
      try {
        // Keep both selections playable until the settings commit finishes.
        // Pressure may run inside another collector's write during this await.
        await store.protect([{context:archive.context,...resolved(current)},{context:archive.context,...resolved(next)}]);
        const candidate=await prepare(next);
        await Promise.all(Object.entries(candidate).map(([slot,w])=>collecting(resolved(next)[slot])&&w!==activeWorkers[slot]?w.refresh():null));
        if(Object.entries(candidate).some(([slot,w])=>collecting(resolved(next)[slot])&&w!==activeWorkers[slot]&&(!w.status().frame||w.status().error)))return {status:503,error:'The selected sources are not ready. Your previous sources remain active; try again shortly.'};
        await commit();current={...next};activeWorkers=candidate;
        try{await capture();}catch{storageError='Could not save radar history.';onEvent('storage-error');}
        return {status:200};
      }catch{return {status:503,error:'Could not apply radar sources. Check Status and try again.'};}
      finally{
        try{await store.protect([{context:archive.context,...resolved(current)}]);}
        catch{storageError='Could not save radar history.';onEvent('storage-error');}
        changing=false;tiles.clear();
      }
    },
    healthSources: () => ({main:sourceStatus('main'),overview:sourceStatus('overview')}),
    status(hours=2) {
      const effective=Object.fromEntries(Object.entries(resolved(current)).map(([role,source])=>[role,collecting(source)?source:'disabled']));
      const live=maskLiveRadar(archive.live(hours),effective),frames=live.frames;
      const sources={main:sourceStatus('main'),overview:sourceStatus('overview')};
      return {...live,frames,frame:frames.at(-1)??null,sources,error:storageError||Object.values(sources).find(s=>s.error)?.error||null,
        fetching:busy||changing,progress:null,view:views.view};
    },
  };
}
