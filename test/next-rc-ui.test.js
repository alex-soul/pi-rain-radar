import test from 'node:test';
import assert from 'node:assert/strict';
import {resizedRect} from '../public/widget-resize.js';
import {selectPlaces} from '../public/map-decoration.js';
import {storageMeter} from '../public/storage-meter.js';
const start={x:100,y:100,width:400,height:200};
const limits={minWidth:100,minHeight:50,maxWidth:640,maxHeight:480,viewportWidth:844,viewportHeight:390};
test('explicit ratio constraints maintain proportions at viewport and minimum limits',()=>{
  for(const edge of ['corner','pinch'])for(const width of [-20,100,450,900]){
    const r=resizedRect(start,width,width/2,{...limits,edge,ratio:2});
    assert.equal(r.width/r.height,2);assert.ok(r.x>=8&&r.y>=8&&r.x+r.width<=836&&r.y+r.height<=382);
  }
});
test('free edges anchor the opposite edge and do not alter the other dimension',()=>{
  const left=resizedRect(start,300,200,{...limits,edge:'left'});assert.equal(left.x+left.width,500);assert.equal(left.height,200);
  const top=resizedRect(start,400,150,{...limits,edge:'top'});assert.equal(top.y+top.height,300);assert.equal(top.width,400);
});
test('all locked edges preserve camera content ratio, including caption allowance',()=>{
  for(const edge of ['top','bottom','left','right','corner','pinch']){
    const r=resizedRect(start,800,500,{...limits,edge,ratio:16/9,extra:24});
    assert.ok(Math.abs(r.width/(r.height-24)-16/9)<1e-10);assert.ok(r.x>=8&&r.y>=8&&r.x+r.width<=836&&r.y+r.height<=382);
  }
});
test('label levels retain exact default and add candidates without removing baseline',()=>{
  const base=[{name:'A',position:[100,100]},{name:'B',position:[240,100]}],extra=[...base,{name:'C',position:[310,180]}];
  assert.deepEqual(selectPlaces(base,extra,0),[]);assert.equal(selectPlaces(base,extra,2),base);
  assert.ok(selectPlaces(base,extra,1).length<base.length);
  for(const density of [3,4,5])for(const p of base)assert.ok(selectPlaces(base,extra,density).includes(p));
});
test('storage uses occupied bytes, never caller-available bytes; unknown stays unknown',()=>{
  assert.deepEqual(storageMeter({capacityBytes:100,usedBytes:70,availableBytes:20}),{total:100,used:70,percent:70});
  for(const v of [null,{capacityBytes:100,availableBytes:20},{capacityBytes:0,usedBytes:0},{capacityBytes:100,usedBytes:101}])assert.equal(storageMeter(v),null);
});

test('unlocked corner dimensions are independent',()=>{
  const wider=resizedRect(start,450,200,{...limits,edge:'corner'});
  assert.equal(wider.width,450);assert.equal(wider.height,200);assert.equal(wider.x,start.x);assert.equal(wider.y,start.y);
  const taller=resizedRect(start,400,240,{...limits,edge:'corner'});
  assert.equal(taller.width,400);assert.equal(taller.height,240);
});
