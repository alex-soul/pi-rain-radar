import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {atomicJson} from './history-files.js';

// One replaceable Live image, separate from immutable ten-minute Archive picks.
// Keeping bytes and metadata in one atomic file makes restart recovery consistent.
export async function createCameraCurrent(folder,store,now){
  const file=join(folder,'camera-current.json');let current=null,error=false;
  try{
    if((await stat(file)).size>12*1024*1024)throw Error('Oversize camera current');
    const saved=JSON.parse(await readFile(file,'utf8'));
    if(saved.version!==1||!Number.isSafeInteger(saved.record?.time)||!Number.isSafeInteger(saved.record?.receivedAt)||! /^[a-f0-9-]{36}$/.test(saved.record?.source??'')||typeof saved.bytes!=='string'||!['metadata','acquisition'].includes(saved.record.basis))throw Error('Invalid camera current');
    current=saved;
  }catch(e){if(e.code!=='ENOENT')error=true;}
  async function finalize(){
    if(!current||current.published)return;
    const slot=Math.ceil(current.record.time/600000)*600000;
    if(slot>now())return;
    // A late metadata image must not replace a representative already selected.
    const prior=await store.latest({kind:'camera',source:current.record.source,context:current.record.context,start:Math.max(0,slot-599999),end:slot});
    if(!prior)await store.publish({...current.record,data:{...current.record.data,archiveSlot:slot}},Buffer.from(current.bytes,'base64'));
    const saved={...current,published:true};await atomicJson(file,saved);current=saved;
  }
  return {
    finalize,error,
    async replace(record,bytes){
      await finalize();
      const saved={version:1,record,bytes:Buffer.from(bytes).toString('base64'),published:false};
      await atomicJson(file,saved);current=saved;await finalize();
    },
    latest(source){return current?.record.source===source?{...current.record,asset:'/api/camera/image?capture='+current.record.time+'&source='+source}:null;},
    image(source,time){return current?.record.source===source&&String(current.record.time)===time?Buffer.from(current.bytes,'base64'):null;},
  };
}
