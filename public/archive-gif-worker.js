import {GIFEncoder,quantize,applyPalette} from './vendor/gifenc.js';
import {GIF_LIMITS} from './archive-gif-model.js';
let gif;
self.onmessage=({data})=>{
  try{
    if(data.type==='frame'){
      gif??=GIFEncoder();
      const rgba=new Uint8Array(data.pixels),palette=quantize(rgba,data.colors);
      gif.writeFrame(applyPalette(rgba,palette),data.width,data.height,{palette,delay:data.delay,repeat:data.loop?0:-1});
      if(gif.bytesView().byteLength>GIF_LIMITS.output)throw Error('GIF exceeds 128 MB. Choose a smaller size or shorter Archive window.');
      self.postMessage({type:'ready'});
    }else if(data.type==='finish'){
      gif.finish();const bytes=gif.bytes();gif=null;self.postMessage({type:'done',bytes},[bytes.buffer]);
    }
  }catch(error){gif=null;self.postMessage({type:'error',message:error.message});}
};
