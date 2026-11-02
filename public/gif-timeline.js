// Native range pseudo-elements do not survive SVG foreignObject rasterization.
// Replace only the export clone with ordinary elements; keep live controls intact.
export function cloneExportTimeline(original,clone){
  const input=original.querySelector?.(':scope > #timeline');
  const target=input&&clone.querySelector?.('#timeline');if(!target)return;
  const style=getComputedStyle(input),box=input.getBoundingClientRect();
  const holder=document.createElement('div');holder.style.cssText=target.style.cssText;
  Object.assign(holder.style,{position:'relative',width:box.width+'px',height:box.height+'px',padding:'0',border:'0',background:'transparent',overflow:'visible'});
  const track=document.createElement('div'),thumb=document.createElement('div');
  const progress=Math.max(0,Math.min(1,(Number(input.value)-Number(input.min||0))/(Number(input.max||100)-Number(input.min||0)||1)));
  const fill=style.getPropertyValue('--timeline-fill').trim()||'#8ab6af',rest=style.getPropertyValue('--timeline-rest').trim()||'#556663';
  Object.assign(track.style,{position:'absolute',left:'7px',right:'7px',top:'calc(50% - 3px)',height:'6px',borderRadius:'4px',backgroundImage:[style.getPropertyValue('--timeline-main-gaps').trim()||'none',style.getPropertyValue('--timeline-overview-gaps').trim()||'none',`linear-gradient(to right, ${fill} 0 ${progress*100}%, transparent ${progress*100}% 100%)`,`linear-gradient(${rest},${rest})`].join(','),backgroundSize:'100% 3px,100% 3px,100% 100%,100% 100%',backgroundPosition:'left top,left bottom,left top,left top',backgroundRepeat:'no-repeat'});
  Object.assign(thumb.style,{position:'absolute',width:'14px',height:'14px',borderRadius:'50%',background:fill,top:'calc(50% - 7px)',left:`${progress*Math.max(0,box.width-14)}px`});
  holder.append(track,thumb);target.replaceWith(holder);
}
