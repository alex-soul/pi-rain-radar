import {GIF_LIMITS} from './archive-gif-model.js';
// Retain compressed assets for this job only; decoded images are frame-local.
export function createGifAssets(signal){
  const items=new Map();let bytes=0;
  const key=url=>new URL(url,location.href).href;
  function resolve(url){
    if(url.startsWith('data:'))return url;
    const value=items.get(key(url));
    if(!value)throw Error('An export asset is unavailable. Close export and reload the Archive window.');
    return value;
  }
  async function decode(url){
    signal.throwIfAborted();const image=new Image();image.src=resolve(url);
    await image.decode();signal.throwIfAborted();return image;
  }
  async function add(url){
    signal.throwIfAborted();if(!url||url.startsWith('data:')||items.has(key(url)))return;
    const target=new URL(url,location.href);
    if(target.origin!==location.origin)throw Error('Export requires locally served images.');
    const response=await fetch(target,{cache:'force-cache',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw Error(`Archive media unavailable (${response.status}). Reload history and try again.`);
    const reader=response.body.getReader(),parts=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(bytes+size>GIF_LIMITS.assets)throw Error('Archive assets exceed 128 MB. Choose a shorter Archive window.');parts.push(value);}}
    catch(error){await reader.cancel();throw error;}
    const blob=new Blob(parts,{type:response.headers.get('content-type')||'application/octet-stream'});
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read export image.'));r.readAsDataURL(blob);});
    items.set(key(url),data);bytes+=size;await decode(url);
  }
  return {add,resolve,decode,clear(){items.clear();bytes=0;},get bytes(){return bytes;}};
}
