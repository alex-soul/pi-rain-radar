import {opendir,lstat} from 'node:fs/promises';
import {join} from 'node:path';

export function createStorageStatus(store,directory,{now=Date.now}={}){
  let value=null,otherBytes=0,lastScan=0,iterator=null,scanBytes=0;
  async function* files(folder,root=false){
    const dir=await opendir(folder);
    for await(const entry of dir){
      if(root&&entry.name==='archive')continue;
      const path=join(folder,entry.name);
      if(entry.isDirectory())yield* files(path);
      else if(entry.isFile())yield path;
    }
  }
  async function refresh(){
    // Reconcile configuration, maps and any remaining legacy allocation in
    // bounded turns. Never scan archive media or follow symbolic links.
    if(!iterator&&(!lastScan||now()-lastScan>60000)){iterator=files(directory,true);scanBytes=0;}
    if(iterator)for(let i=0;i<128;i++){
      const item=await iterator.next();
      if(item.done){otherBytes=scanBytes;lastScan=now();iterator=null;break;}
      try{scanBytes+=(await lstat(item.value)).size;}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    const s=await store.status(),span=s.oldest===null?0:Math.max(0,(s.newest-s.oldest)/86400000);
    const bytesPerDay=span>=1&&s.mediaBytes>0?s.mediaBytes/span:null;
    value={...s,otherBytes:iterator?Math.max(otherBytes,scanBytes):otherBytes,
      appUsedBytes:s.accountedBytes+(iterator?Math.max(otherBytes,scanBytes):otherBytes),
      accountingComplete:s.accountingComplete&&!iterator,
      estimatedCapacityDays:bytesPerDay?Math.floor((s.mediaBytes+Math.max(0,s.availableBytes-s.reserveBytes))/bytesPerDay):null,
      estimateLearning:!bytesPerDay};
    return value;
  }
  return {refresh,status:()=>value,async setRetention(days){await store.setRetention(days);await refresh();}};
}
