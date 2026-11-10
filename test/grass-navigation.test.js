import test from 'node:test';
import assert from 'node:assert/strict';
import {panWindow,resizeWindow,setupNavigation,minimumWindow} from '../scripts/dev-grass-navigation.js';
const day=86400000,bounds={start:0,end:30*day};
test('history navigation clamps at retained edges, preserves duration and anchors the opposite zoom edge',()=>{
 const window={start:23*day,end:30*day};
 assert.deepEqual(panWindow(window,100*day,bounds),window);
 assert.deepEqual(panWindow(window,-100*day,bounds),{start:0,end:7*day});
 assert.deepEqual(panWindow(bounds,day,bounds),bounds);
 assert.deepEqual(resizeWindow(window,'start',0,bounds),{start:0,end:30*day});
 assert.deepEqual(resizeWindow(window,'end',24*day,bounds),{start:23*day,end:24*day});
 assert.deepEqual(resizeWindow(window,'start',100*day,bounds),{start:30*day-minimumWindow,end:30*day});
 assert.deepEqual(resizeWindow({start:0,end:1000},'start',900,{start:0,end:1000}),{start:0,end:1000});
 for(let i=-60;i<60;i++){
   const next=panWindow(window,i*day,bounds);assert.equal(next.end-next.start,7*day);assert.ok(next.start>=bounds.start&&next.end<=bounds.end);
 }
});
test('chart tap inspects; horizontal drag pans; vertical gestures and cancellation do not pan',()=>{
 const host=()=>({events:{},classList:{add(){},remove(){}},addEventListener(k,f){this.events[k]=f;},getBoundingClientRect:()=>({left:0,right:1000,width:1000}),setPointerCapture(){},releasePointerCapture(){},hasPointerCapture:()=>true});
 const chart=host(),timeline=host(),selection=host(),left=host(),right=host();let window={start:20*day,end:27*day},inspected=0,changes=0;
 setupNavigation({chart,timeline,selection,leftHandle:left,rightHandle:right,getBounds:()=>bounds,getWindow:()=>window,setWindow:v=>{window=v;changes++;},inspect:()=>inspected++,plotLeft:0,plotRight:0});
 const event=(x,y=50,type='pointermove')=>({clientX:x,clientY:y,button:0,isPrimary:true,pointerId:1,pointerType:'touch',type,currentTarget:chart,preventDefault(){}});
 chart.events.pointerdown(event(500));chart.events.pointerup(event(500,50,'pointerup'));assert.equal(inspected,1);assert.equal(changes,0);
 chart.events.pointerdown(event(500));chart.events.pointermove(event(502,80));chart.events.pointerup(event(502,80,'pointerup'));assert.equal(changes,0);
 chart.events.pointerdown(event(500));chart.events.pointermove(event(600));assert.deepEqual(window,{start:19.3*day,end:26.3*day});assert.equal(changes,1);
 chart.events.pointercancel(event(600,50,'pointercancel'));chart.events.pointermove(event(800));assert.equal(changes,1);
 selection.events.keydown({key:'End',preventDefault(){}});assert.equal(window.end,bounds.end);assert.equal(window.end-window.start,7*day);
 left.events.keydown({key:'Home',preventDefault(){}});assert.deepEqual(window,bounds);
});
