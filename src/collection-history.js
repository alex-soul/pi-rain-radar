import {historyRows} from './radar-history.js';

// Non-secret collection policy uses the existing retained transition boundary.
export function collectionRecorder(store, source, {now=Date.now}={}) {
 let queue=Promise.resolve();
 return data=>{
  const task=queue.then(async()=>{
   const last=await store.contextBefore({source,context:'appliance',end:now()});
   if(last&&JSON.stringify(last.data)===JSON.stringify(data))return;
   const time=Math.max(now(),(last?.time??-1)+1);
   await store.put([{kind:'transition',source,context:'appliance',time,receivedAt:time,data}]);
  });
  queue=task.catch(()=>{});return task;
 };
}
export async function collectionPeriods(store,end,hours){
 const start=Math.max(0,(end-hours*3600)*1000),until=end*1000,events=[];
 for(const source of ['camera-collection','cloud-collection']){
  const boundary=await store.contextBefore({source,context:'appliance',end:start});
  const rows=await historyRows(store,{kind:'transition',source,context:'appliance',start,end:until});
  for(const row of [...(boundary?[boundary]:[]),...rows])events.push({time:row.time/1000,...row.data});
 }
 events.sort((a,b)=>a.time-b.time);let current={};
 return events.map(event=>({...current={...current,...event}}));
}
