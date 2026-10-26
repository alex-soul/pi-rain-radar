import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {gifPlan} from '../public/archive-gif-model.js';
import {GIFEncoder,quantize,applyPalette} from '../public/vendor/gifenc.js';
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
