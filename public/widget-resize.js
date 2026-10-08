// The same constrained rectangle is used by mouse edges, corners and touch pinch.
export function resizedRect(start, width, height, {edge='corner', ratio=null, extra=0, minWidth=20, minHeight=20, maxWidth=Infinity, maxHeight=Infinity, viewportWidth, viewportHeight}={}) {
  const ax=edge==='left'?1:(edge==='pinch'||edge==='top'||edge==='bottom')?0.5:0;
  const ay=edge==='top'?1:(edge==='pinch'||edge==='left'||edge==='right')?0.5:0;
  const anchorX=start.x+start.width*ax,anchorY=start.y+start.height*ay;
  const bound=(anchor,fraction,limit)=>Math.min(fraction? (anchor-8)/fraction:Infinity,fraction<1?(limit-8-anchor)/(1-fraction):Infinity);
  const mw=Math.max(1,Math.min(maxWidth,bound(anchorX,ax,viewportWidth))),mh=Math.max(1,Math.min(maxHeight,bound(anchorY,ay,viewportHeight)));
  if(ratio){
    const hi=Math.max(1,Math.min(mw,(mh-extra)*ratio));
    const lo=Math.min(hi,Math.max(minWidth,(minHeight-extra)*ratio));
    width=Math.max(lo,Math.min(hi,width));height=width/ratio+extra;
  }else{width=Math.max(Math.min(minWidth,mw),Math.min(mw,width));height=Math.max(Math.min(minHeight,mh),Math.min(mh,height));}
  return {x:anchorX-width*ax,y:anchorY-height*ay,width,height};
}
export function setupWidgetResize(panel,{limits,ratio=()=>null,apply,save,cancelDrag}) {
  const corner=panel.querySelector('[id$="-resize"]'),points=new Map();let gesture=null;
  const editable=()=>!document.body.classList.contains('screen-locked');
  const rect=()=>{const r=panel.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  for(const edge of ['left','right','top','bottom']){
    const node=document.createElement('span');node.className='widget-edge';node.dataset.edge=edge;node.setAttribute('aria-hidden','true');panel.append(node);
  }
  const constrain=(s,w,h,edge,lock)=>resizedRect(s,w,h,{...limits,edge,...lock,viewportWidth:innerWidth,viewportHeight:innerHeight});
  function begin(edge,e){panel.dataset.resizing='true';panel.dispatchEvent(new Event('radar-widget-gesture'));const start=rect(),locked=ratio();gesture={edge,start,x:e.clientX,y:e.clientY,id:e.pointerId,lock:locked};cancelDrag();}
  panel.addEventListener('pointerdown',e=>{
    if(!editable()||e.button!==0)return;
    const edge=e.target.closest('.widget-edge')?.dataset.edge;
    if(e.target===corner||edge){if(edge&&e.pointerType!=='mouse')return;begin(edge??'corner',e);panel.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.pointerType!=='touch'||e.target.closest('button,input,select,a'))return;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.size===2){
      begin('pinch',e);const [a,b]=[...points.values()];gesture.distance=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));gesture.lock=ratio()??{ratio:gesture.start.width/gesture.start.height,extra:0};
      for(const id of points.keys())panel.setPointerCapture(id);
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  panel.addEventListener('pointermove',e=>{
    if(points.has(e.pointerId))points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!gesture||!editable())return;
    const {start,edge,lock}=gesture;let w=start.width,h=start.height;
    if(edge==='pinch'){
      if(points.size!==2)return;const [a,b]=[...points.values()];const scale=Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance;w*=scale;h=(w/(lock.ratio))+lock.extra;
    }else{
      if(gesture.id!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
      if(edge==='left')w-=dx;else if(edge==='right'||edge==='corner')w+=dx;
      if(edge==='top')h-=dy;else if(edge==='bottom'||edge==='corner')h+=dy;
      if(lock){if(edge==='top'||edge==='bottom'||edge==='corner'&&Math.abs(dy*lock.ratio)>Math.abs(dx))w=(h-lock.extra)*lock.ratio;h=w/lock.ratio+lock.extra;}
    }
    apply(constrain(start,w,h,edge,lock));e.preventDefault();e.stopImmediatePropagation();
  },true);
  function end(e){points.delete(e.pointerId);if(gesture&&(gesture.edge==='pinch'||gesture.id===e.pointerId)){gesture=null;points.clear();delete panel.dataset.resizing;panel.dispatchEvent(new Event('radar-widget-gesture'));cancelDrag();save();}}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])panel.addEventListener(name,end,true);
  const cancel=()=>{gesture=null;points.clear();delete panel.dataset.resizing;panel.dispatchEvent(new Event('radar-widget-gesture'));cancelDrag();save();};
  window.addEventListener('radar-screen-lock',cancel);window.addEventListener('blur',cancel);
  corner.addEventListener('keydown',e=>{
    const delta={ArrowRight:[1,0],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowUp:[0,-1]}[e.key];if(!delta||!editable())return;
    e.preventDefault();e.stopPropagation();const s=rect(),lock=ratio(),step=e.shiftKey?40:10;
    let w=s.width+delta[0]*step,h=s.height+delta[1]*step;
    if(lock){if(delta[1])w=(h-lock.extra)*lock.ratio;h=w/lock.ratio+lock.extra;}
    apply(constrain(s,w,h,'corner',lock));save();
  });
}
