import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {cameraExifTime} from './camera-time.js';

// Separate process: a stuck native decoder can be killed without taking radar,
// the HTTP loop or the shared SQLite worker down with it.
sharp.cache(false);sharp.concurrency(1);
process.once('message',async ({bytes,receivedAt,preview})=>{
  try{
    const image=sharp(bytes,{limitInputPixels:16000000,failOn:'warning',animated:false});
    const metadata=await image.metadata();
    if(!['jpeg','png','webp'].includes(metadata.format)||(metadata.pages??1)>1)throw Error();
    const timestamp=cameraExifTime(metadata.exif,receivedAt);
    const {data,info}=await image.autoOrient().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).timeout({seconds:6}).toBuffer({resolveWithObject:true});
    if(data.length>8*1024*1024)throw Error();
    const thumbnail=preview?await sharp(data).resize({width:192,height:128,fit:'inside',withoutEnlargement:true}).jpeg({quality:65}).toBuffer():null;
    process.send({ok:true,bytes:data,thumbnail,width:info.width,height:info.height,hash:createHash('sha256').update(data).digest('hex'),time:timestamp??receivedAt,basis:timestamp===null?'acquisition':'metadata'},()=>process.disconnect());
  }catch{process.send({ok:false},()=>process.disconnect());}
});
