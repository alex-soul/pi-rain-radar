import {GIFEncoder,quantize,applyPalette} from './vendor/gifenc.js';
let gif;
self.onmessage=({data})=>{
  try{
    if(data.type==='frame'){
      gif??=GIFEncoder();
      const rgba=new Uint8Array(data.pixels),palette=quantize(rgba,data.colors);
      gif.writeFrame(applyPalette(rgba,palette),data.width,data.height,{palette,delay:data.delay,repeat:data.loop?0:-1});
      // Drain each encoded frame; retain encoder header state, not the whole GIF.
      const bytes=gif.bytes();gif.stream.reset();
      self.postMessage({type:'ready',bytes},[bytes.buffer]);
    }else if(data.type==='finish'){
      gif.finish();const bytes=gif.bytes();gif=null;self.postMessage({type:'done',bytes},[bytes.buffer]);
    }
  }catch(error){gif=null;self.postMessage({type:'error',message:error.message});}
};
