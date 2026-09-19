import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../public/diagnostics.js',import.meta.url),'utf8')).replace('export function','function').replace(/^import .*;\r?\n/gm,'');

test('diagnostics requests stop when hidden or closed and discard late results',async()=>{
  const handlers={},docHandlers={},timers=new Map();let sequence=0,calls=0,resolveRequest,editable=true;
  const panel={hidden:true,closest:()=>null};
  const output={scrollHeight:0,scrollTop:0,clientHeight:120,rows:[],replaceChildren(...rows){this.rows=rows;}};
  const note={textContent:''};
  const nodes={'settings-panel-log':panel,'diagnostic-events':output,'diagnostic-note':note};
  const dialog={addEventListener:(name,fn)=>handlers[name]=fn,close(){editable=false;handlers.close();}};
  let browserEvents=[];
  const context={connectionEvents:()=>browserEvents,dialog,request:()=>{calls++;return new Promise(resolve=>resolveRequest=resolve);},canEdit:()=>editable,
    document:{hidden:false,querySelector:()=>({content:'Europe/London'}),getElementById:id=>nodes[id],addEventListener:(name,fn)=>docHandlers[name]=fn,createElement:()=>({append(){}})},
    setTimeout:(fn)=>{const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),Date};
  vm.runInNewContext(source+'\nthis.sync=setupDiagnostics(dialog,request,canEdit);',context);
  context.sync();assert.equal(calls,0);
  panel.hidden=false;context.sync();assert.equal(calls,1);
  panel.hidden=true;handlers['settings-tab-change']();
  resolveRequest({ok:true,json:async()=>({events:[{}],limit:25})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(output.rows.length,0);assert.equal(timers.size,0);
  panel.hidden=false;context.sync();
  resolveRequest({ok:true,json:async()=>({events:[],limit:25})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(note.textContent,'Last 25 events · appliance since restart; this browser since page load');assert.equal(timers.size,1);
  dialog.close();assert.equal(timers.size,0);
  context.sync();assert.equal(calls,2);
  editable=true;
  browserEvents=[{source:'This browser',severity:'error',time:'2026-09-19T12:00:00Z',lastAt:'2026-09-19T12:00:00Z',message:'Cannot reach appliance',count:1}];
  context.sync();resolveRequest({ok:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(output.rows.length,1);
  assert.match(note.textContent,/browser/);
});
