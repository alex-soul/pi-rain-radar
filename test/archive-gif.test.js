import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {gifPlan} from '../public/archive-gif-model.js';
import {GIFEncoder,quantize,applyPalette} from '../public/vendor/gifenc.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('worker drains valid frame chunks into one GIF without retaining prior encoded frames',async()=>{
 const source=(await readFile(new URL('../public/archive-gif-worker.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
 const messages=[],self={postMessage:m=>messages.push(m)};
 vm.runInNewContext(source,{self,GIFEncoder,quantize,applyPalette,Uint8Array});
 for(let i=0;i<145;i++){
  const pixels=new Uint8Array(32*20*4);for(let p=0;p<pixels.length;p+=4){pixels[p]=i;pixels[p+1]=255-i;pixels[p+3]=255;}
  self.onmessage({data:{type:'frame',pixels:pixels.buffer,width:32,height:20,colors:256,delay:i===144?1000:100,loop:true}});
  assert.equal(messages.at(-1).type,'ready');assert(messages.at(-1).bytes.length<1000);
 }
 self.onmessage({data:{type:'finish'}});
 const meta=await sharp(Buffer.concat(messages.map(m=>Buffer.from(m.bytes))),{animated:true}).metadata();
 assert.equal(meta.pages,145);assert.equal(meta.width,32);assert.equal(meta.pageHeight,20);
 assert.equal(meta.delay.at(-1),1000);assert(meta.delay.slice(0,-1).every(v=>v===100));
});

test('progressive asset retention allows a window larger than 128 MB and releases old frames',async t=>{
 const source=(await readFile(new URL('../public/archive-gif-assets.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function','function');
 let calls=0;
 class Image{async decode(){}}
 class FileReader{readAsDataURL(){this.result='data:image/png;base64,AAAA';this.onload();}}
 const context=vm.createContext({GIF_LIMITS:{assets:128*1024*1024},URL,location:{href:'http://localhost/',origin:'http://localhost'},Image,FileReader,Blob,AbortSignal,
  fetch:async()=>{calls++;return new Response(new Uint8Array(1024*1024));}});
 vm.runInContext(source,context);const assets=context.createGifAssets(new AbortController().signal);
 for(let i=0;i<145;i++){assets.retain(['/static','/frame/'+i]);await assets.add('/static');await assets.add('/frame/'+i);assert.equal(assets.bytes,2*1024*1024);assert(assets.resolve('/frame/'+i).startsWith('data:'));}
 assert.equal(calls,146);assert.throws(()=>assets.resolve('/frame/0'),/unavailable/);
 assets.clear();assert.equal(assets.bytes,0);
});
test('GIF timing retains the complete cycle, speed and final hold at centisecond precision',()=>{
  const plan=gifPlan({count:13,width:1280,height:720,scale:.75,speed:1,hold:2.4});
  assert.deepEqual([plan.width,plan.height,plan.duration],[960,540,9360]);
  assert.equal(plan.delays[0],650);assert.equal(plan.delays.at(-1),1560);
  const fast=gifPlan({count:145,width:390,height:280,speed:3,hold:2.4});
  assert.equal(fast.delays.length,145);assert.equal(fast.delays[0],220);assert.equal(fast.delays.at(-1),520);
  assert.equal(gifPlan({count:1,width:390,height:280,hold:2.4}).duration,1560);
  assert.throws(()=>gifPlan({count:0,width:1280,height:720}),/Load/);
  assert.throws(()=>gifPlan({count:2,width:5000,height:5000}),/smaller/);
});
test('vendored encoder produces a decodable animated GIF with distinct frames and exact delays',async()=>{
  for(const loop of [true,false]){
    const gif=GIFEncoder();
    for(const [color,delay]of [[[255,0,0,255],650],[[0,255,0,255],1560]]){
      const rgba=Uint8Array.from(Array.from({length:16*12},()=>color).flat()),palette=quantize(rgba,64);
      gif.writeFrame(applyPalette(rgba,palette),16,12,{palette,delay,repeat:loop?0:-1});
    }
    gif.finish();const buffer=Buffer.from(gif.bytes()),meta=await sharp(buffer,{animated:true}).metadata();
    assert.equal(meta.pages,2);assert.equal(meta.width,16);assert.equal(meta.pageHeight,12);
    assert.deepEqual(meta.delay,[650,1560]);assert.equal(meta.loop,loop?0:1);
    const first=await sharp(buffer,{page:0}).raw().toBuffer(),last=await sharp(buffer,{page:1}).raw().toBuffer();
    assert.notDeepEqual(first,last);
  }
});
