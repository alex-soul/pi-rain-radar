import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {hash} from './map.js';
import {liveDueThrough, classifyCoverage} from '../public/live-window.js';

export const validArchiveHours=hours=>Number.isInteger(hours)&&hours>=1&&hours<=24;
const roles=['main','overview'];
const resolve=s=>({main:s.main,overview:s.overview==='same'?s.main:s.overview});
export async function historyRows(store,query){
  const rows=[];let after;
  do{const page=await store.range({...query,after,limit:256});rows.push(...page.records);after=page.next;}while(after);
  return rows;
}

// Only a six-hour working set lives on the main thread. Archive reads build an
// independent, bounded window; neither retention nor a reader mutates playback.
export async function createRadarHistory(store,views,{now=Date.now,selection}){
  const context=hash(views);let current=resolve(selection),revision=0;
  let liveRows=[],incidents=[],transitions=[],activeSince={main:now(),overview:now()};
  let generation=(await store.status()).generation,fallback=[];
  let writing=Promise.resolve();
  const serial=fn=>{const task=writing.then(fn);writing=task.catch(()=>{});return task;};
  const previous=await store.contextBefore({source:'selection',context,end:now()});
  if(!previous||roles.some(role=>previous.data[role]!==current[role]))await store.put([{kind:'transition',receivedAt:now(),source:'selection',context,time:previous?now():Math.max(0,now()-25200000),data:current}]);
  async function read(start,end){
    const query={context,start:Math.max(0,start*1000),end:end*1000};
    const [rows,events,changes,boundary]=await Promise.all([
      historyRows(store,{...query,kind:'radar'}),historyRows(store,{...query,kind:'incident'}),
      historyRows(store,{...query,kind:'transition',receivedAt:now(),source:'selection'}),
      store.contextBefore({source:'selection',context,end:query.start}),
    ]);
    return {rows,events,changes:[...(boundary?[boundary]:[]),...changes]};
  }
  function window(data,start,end){
    // A protected Live fallback can predate the surviving transition boundary
    // after pressure. Its own source is authoritative for that held image only;
    // ordinary Archive interpretation still follows recorded transitions.
    const held=new Map((data.held??[]).map(r=>[`${r.time/1000}:${r.role}`,r.source]));
    const expected=(time,role)=>held.get(`${time}:${role}`)??data.changes.findLast(r=>r.time<=time*1000)?.data[role]??data.changes[0]?.data[role]??current[role];
    const byTime=new Map();
    for(const r of data.rows){
      const time=r.time/1000;if(time<start||time>end||r.source!==expected(time,r.role))continue;
      const f=byTime.get(time)??{time,url:null,overviewUrl:null,source:null,overviewSource:null,mainTime:null,overviewTime:null,expectedSources:Object.fromEntries(roles.map(role=>[role,expected(time,role)]))};
      if(r.role==='main'){f.url=`/archive/${r.asset}`;f.source=r.source;f.mainTime=time;}
      else{f.overviewUrl=`/archive/${r.asset}`;f.overviewSource=r.source;f.overviewTime=time;}
      byTime.set(time,f);
    }
    const frames=[...byTime.values()].sort((a,b)=>a.time-b.time),times=new Set(frames.map(f=>f.time));
    for(let t=Math.ceil(start/600)*600;t<=end;t+=600)times.add(t);
    const coverage=[...times].sort((a,b)=>a-b).map(time=>({time,main:!!byTime.get(time)?.url,overview:!!byTime.get(time)?.overviewUrl,sources:Object.fromEntries(roles.map(role=>[role,expected(time,role)]))}));
    const eventMap=new Map(data.events.map(r=>[`${r.time}:${r.role}:${r.source}`,r.data]));
    const counts=Object.fromEntries(roles.map(role=>{
      let tracked=0,gapsSeen=0,lateArrivals=0,available=0;
      for(const slot of coverage){if(slot.sources[role]==='disabled')continue;const event=eventMap.get(`${slot.time*1000}:${role}:${slot.sources[role]}`);tracked+=!!event?.tracked;gapsSeen+=!!event?.gap;lateArrivals+=event?.arrivedAt>slot.time*1000+600000;available+=slot[role];}
      return [role,{tracked,gapsSeen,lateArrivals,available,missing:coverage.filter(slot=>slot.sources[role]!=='disabled').length-available,total:coverage.filter(slot=>slot.sources[role]!=='disabled').length}];
    }));
    return {start,end,frames,coverage,counts,playable:frames.length,complete:coverage.length>0&&coverage.every(f=>roles.every(role=>f.sources[role]==='disabled'||f[role]))};
  }
  async function reload(){
    const data=await read(Math.max(0,Math.floor(now()/1000)-25200),Math.floor(now()/1000));
    if(!data.rows.length&&liveRows.length){
      const nextGeneration=(await store.status()).generation;
      if(nextGeneration!==generation){
        fallback=roles.map(role=>liveRows.findLast(r=>r.role===role&&r.source===current[role])).filter(Boolean);
        generation=nextGeneration;activeSince={main:now(),overview:now()};
      }
    }
    const held=await Promise.all(roles.map(role=>store.lastGood({context,source:current[role],role})));
    fallback=[...new Map([...fallback,...held.filter(Boolean)].map(r=>[r.role,r])).values()];
    fallback=fallback.filter(r=>r.source===current[r.role]&&!data.rows.some(next=>next.role===r.role&&next.source===r.source));
    liveRows=data.rows;incidents=data.events;transitions=data.changes;revision++;
  }
  await reload();
  async function observe(clock=now()){
    const end=Math.max(Math.floor(clock/600000)*600-600,...liveRows.filter(r=>r.time<=clock).map(r=>r.time/1000)),updates=[];
    const times=new Set(liveRows.filter(r=>r.time>=end*1000-21600000&&r.time<=clock).map(r=>r.time/1000));
    for(let t=Math.ceil((end-21600)/600)*600;t<=end;t+=600)times.add(t);
    for(const t of times)for(const role of roles){
      if(current[role]==='disabled')continue;
      const source=current[role],row=liveRows.find(r=>r.time===t*1000&&r.role===role&&r.source===source);
      const previous=incidents.find(r=>r.time===t*1000&&r.role===role&&r.source===source)?.data;
      if(t*1000<=activeSince[role]&&!previous)continue;
      const data={tracked:true,gap:previous?.gap||!row,arrivedAt:previous?.arrivedAt??row?.receivedAt??null};
      if(JSON.stringify(previous)!==JSON.stringify(data))updates.push({kind:'incident',receivedAt:now(),context,source,role,time:t*1000,data});
    }
    for(let i=0;i<updates.length;i+=128)await store.put(updates.slice(i,i+128));
    if(updates.length)await reload();
  }
  return {
    context,revision:()=>revision,reload:()=>serial(reload),
    observe:()=>serial(async()=>{await reload();await observe();}),
    add:(observations=[])=>serial(async()=>{
      const arrivals=observations.filter(r=>Number.isFinite(r.arrivedAt)).map(r=>r.arrivedAt);
      await observe(Math.min(now(),...arrivals)-0.001);await reload();await observe();
    }),
    select:s=>serial(async()=>{
      const next=resolve(s);if(roles.every(role=>current[role]===next[role]))return;
      await store.put([{kind:'transition',receivedAt:now(),source:'selection',context,time:now(),data:next}]);
      for(const role of roles)if(next[role]!==current[role])activeSince[role]=now();
      current=next;await reload();
    }),
    async available(start=Math.max(0,now()-86400000),end=now()){
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start>32*86400000)return null;
      const times=[];let next=start;
      for(const kind of ['radar','cloud']){next=start;do{const page=await store.calendar({kind,context,start:next,end});times.push(...page.times.map(t=>t/1000));next=page.next;}while(next);}
      const [status,bounds]=await Promise.all([store.status(),store.extent({context})]);return {times:[...new Set(times)].sort((a,b)=>a-b),retentionDays:status.retentionDays,...bounds};
    },
    async window(end,hours=2){
      if(!Number.isSafeInteger(end)||end>now()/1000||!Number.isInteger(hours)||hours<1||hours>24)return null;
      const data=await read(end-hours*3600,end),result=window(data,end-hours*3600,end);
      return result.frames.some(f=>f.time===end)?result:null;
    },
    live(hours=2){
      if(![2,4,6].includes(hours))return null;
      const gridEnd=liveDueThrough(now()/1000),end=gridEnd;
      const start=end-hours*3600,data={rows:[...fallback,...liveRows],held:fallback,events:incidents,changes:transitions},result=window(data,start,end);
      return {...result,...classifyCoverage(result.coverage,gridEnd),counts:Object.fromEntries(roles.map(role=>[role,{...result.counts[role],...classifyCoverage(result.coverage,gridEnd).counts[role]}])),dueThrough:gridEnd,borrowFrames:window(data,start-1800,start-1).frames,serverTime:now(),cadenceSeconds:600};
    },
  };
}

// Composer persistence is bounded to the normal initial two-hour acquisition.
export async function radarPersistence(store,directory,{context,source,role,now=Date.now}){
  const query=kind=>({kind,context,source,role,start:Math.max(0,now()-10800000),end:now()});
  const images=new Map((await historyRows(store,query('radar'))).map(r=>[r.time/1000,r]));
  const held=await store.lastGood({context,source,role});if(held)images.set(held.time/1000,held);
  return {
    frames:[...images.keys()].sort((a,b)=>a-b).slice(-13),
    settling:(await historyRows(store,query('settling'))).map(r=>[r.time/1000,r.data.seen]),
    async read(time){const r=images.get(time);if(!r)throw new Error('Image unavailable');await readFile(join(directory,'archive',r.asset));return `../archive/${r.asset}`;},
    has: time=>images.has(time),
    async filterHistory(frames){
      const [rows,latest,status]=await Promise.all([historyRows(store,query('radar')),store.lastGood({context,source,role}),store.status()]);
      // Inactive-source caches can outlive their retained files. Reconcile
      // before deciding that an observation needs no acquisition.
      images.clear();for(const r of rows)images.set(r.time/1000,r);if(latest)images.set(latest.time/1000,latest);
      const cutoff=status.cutoff/1000,newest=frames.at(-1)?.time;return frames.filter(f=>f.time>=cutoff||f.time===newest);
    },
    async publish(time,bytes){await store.publish({kind:'radar',context,source,role,time:time*1000,receivedAt:now(),data:{}},bytes);const r=await store.latest({...query('radar'),start:time*1000,end:time*1000})??await store.lastGood({context,source,role});if(!r||r.time!==time*1000)throw new Error('Image expired');images.set(time,r);for(const t of images.keys())if(t<time-10800)images.delete(t);return `../archive/${r.asset}`;},
    async saveSettling(entries){if(entries.length)await store.put(entries.map(([time,seen])=>({kind:'settling',receivedAt:now(),context,source,role,time:time*1000,data:{seen}})));},
  };
}
