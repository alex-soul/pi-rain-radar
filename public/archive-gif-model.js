import {playbackFrameDelay} from './weather-format.js';
export const GIF_LIMITS={pixels:8_000_000,assets:128*1024*1024};
export function gifPlan({count,width,height,scale=1,speed=1,hold=1}){
  if(!Number.isSafeInteger(count)||count<1)throw Error('Load an Archive window first.');
  const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
  if(!Number.isFinite(w*h)||w*h>GIF_LIMITS.pixels||w>65535||h>65535)throw Error('Choose a smaller output size (maximum 8 megapixels).');
  const delays=Array.from({length:count},(_,i)=>Math.max(20,Math.round(playbackFrameDelay(i===count-1,speed,hold)/10)*10));
  return {width:w,height:h,delays,duration:delays.reduce((a,b)=>a+b,0)};
}
