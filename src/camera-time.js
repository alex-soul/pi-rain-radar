// EXIF DateTimeOriginal is only reliable here with an explicit UTC offset.
// Never substitute HTTP Date, Last-Modified or HA entity-change time.
export function cameraExifTime(exif,receivedAt){
  if(!exif)return null;
  try{
    const raw=Buffer.from(exif),b=raw.subarray(raw.subarray(0,6).equals(Buffer.from('Exif\0\0'))?6:0);
    const le=b.toString('ascii',0,2)==='II';
    if(!le&&b.toString('ascii',0,2)!=='MM')return null;
    const u16=i=>le?b.readUInt16LE(i):b.readUInt16BE(i),u32=i=>le?b.readUInt32LE(i):b.readUInt32BE(i);
    if(u16(2)!==42)return null;
    const tags=new Map();
    function directory(offset){
      const n=u16(offset);if(n>256)throw Error();
      for(let i=0;i<n;i++){const p=offset+2+i*12,tag=u16(p),type=u16(p+2),count=u32(p+4);if(count>128)continue;
        if(type===2){const start=count<=4?p+8:u32(p+8);if(start+count>b.length)throw Error();tags.set(tag,b.toString('ascii',start,start+count).replace(/\0.*$/s,''));}
        else if(tag===0x8769&&type===4&&count===1)tags.set(tag,u32(p+8));
      }
    }
    directory(u32(4));if(tags.has(0x8769))directory(tags.get(0x8769));
    const date=tags.get(0x9003),offset=tags.get(0x9011);
    if(!/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(date??'')||! /^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset??'')||/^[-+]14:(?!00)/.test(offset))return null;
    const iso=date.slice(0,10).replaceAll(':','-')+'T'+date.slice(11),local=Date.parse(iso+'Z');
    if(!Number.isFinite(local)||new Date(local).toISOString().slice(0,19)!==iso)return null;
    const time=Date.parse(iso+offset);
    return Number.isSafeInteger(time)&&time>=0&&time<=receivedAt?time:null;
  }catch{return null;}
}
