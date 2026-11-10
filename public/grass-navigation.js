// Viewport operations never change the replay or fetch more history.
export const minimumWindow=6*3600000;
export function panWindow(window,delta,bounds){
  const width=Math.min(window.end-window.start,bounds.end-bounds.start);
  const start=Math.max(bounds.start,Math.min(bounds.end-width,window.start+delta));
  return {start,end:start+width};
}
export function resizeWindow(window,edge,time,bounds,min=minimumWindow){
  min=Math.min(min,bounds.end-bounds.start);
  return edge==='start'?{start:Math.max(bounds.start,Math.min(window.end-min,time)),end:window.end}:{start:window.start,end:Math.min(bounds.end,Math.max(window.start+min,time))};
}
export function setupNavigation({chart,timeline,selection,leftHandle,rightHandle,getBounds,getWindow,setWindow,inspect,plotLeft,plotRight}){
  let gesture=null;
  const begin=(event,kind,host)=>{
    if(event.button!==0||!event.isPrimary)return;
    const rect=host.getBoundingClientRect();
    if(kind==='chart'&&(event.clientX<rect.left+plotLeft||event.clientX>rect.right-plotRight))return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,window:{...getWindow()},kind,host,width:kind==='chart'?rect.width-plotLeft-plotRight:rect.width,active:false};
    host.setPointerCapture(event.pointerId);
  };
  const move=event=>{
    if(!gesture){if(event.pointerType!=='touch'&&event.currentTarget===chart)inspect(event);return;}
    if(gesture.id!==event.pointerId)return;
    const g=gesture,dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(!g.active){
      if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>6){gesture=null;g.host.releasePointerCapture(event.pointerId);return;}
      if(Math.abs(dx)<6)return;g.active=true;g.host.classList.add('dragging');
    }
    event.preventDefault();
    const bounds=getBounds(),span=g.kind==='chart'?g.window.end-g.window.start:bounds.end-bounds.start;
    const delta=dx/g.width*span;
    const next=['start','end'].includes(g.kind)?resizeWindow(g.window,g.kind,g.window[g.kind]+delta,bounds):panWindow(g.window,g.kind==='chart'?-delta:delta,bounds);
    setWindow(next);
  };
  const finish=event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const g=gesture;gesture=null;g.host.classList.remove('dragging');
    if(g.host.hasPointerCapture(event.pointerId))g.host.releasePointerCapture(event.pointerId);
    if(event.type==='pointerup'&&!g.active&&g.kind==='chart')inspect(event);
  };
  chart.addEventListener('pointerdown',event=>begin(event,'chart',chart));
  timeline.addEventListener('pointerdown',event=>{
    const kind=event.target.closest('[data-edge]')?.dataset.edge??(event.target.closest('#timeline-selection')?'pan':null);
    if(kind)begin(event,kind,timeline);
  });
  for(const host of [chart,timeline]){
    host.addEventListener('pointermove',move);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])host.addEventListener(type,finish);
  }
  const keys=(event,edge)=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const window=getWindow(),bounds=getBounds(),step=(window.end-window.start)/10;
    if(edge){const time=event.key==='Home'?bounds.start:event.key==='End'?bounds.end:window[edge]+(event.key==='ArrowLeft'?-step:step);setWindow(resizeWindow(window,edge,time,bounds));}
    else{const delta=event.key==='Home'?bounds.start-window.start:event.key==='End'?bounds.end-window.end:(event.key==='ArrowLeft'?-step:step);setWindow(panWindow(window,delta,bounds));}
  };
  selection.addEventListener('keydown',event=>keys(event));
  leftHandle.addEventListener('keydown',event=>keys(event,'start'));
  rightHandle.addEventListener('keydown',event=>keys(event,'end'));
}
