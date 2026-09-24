import {acceptIntegrationStatus} from '../public/integrations-state.js';
import {cameraSummary} from '../public/camera-settings-ui.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {liveDueThrough,ageLiveCoverage} from '../public/live-window.js';
const app=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
const pollCode=app.slice(app.indexOf("window.addEventListener('radar-playback-window'"),app.indexOf('try {\n  const response = await fetch(`/maps/'));
const frames=(end,hours)=>Array.from({length:hours*6+1},(_,i)=>({time:end-(hours*6-i)*600,url:`/${end-(hours*6-i)*600}`,overviewUrl:`/o${end-(hours*6-i)*600}`}));
function harness() {
  let hours=2,end=60000,decodeGate=null;const events={},requests=[],adoptions=[],nodes={};
  const c=vm.createContext({updateCloudSettings(){},acceptIntegrationStatus,cameraSummary,timeZone:'Europe/London',storageSummary:()=>"Storage",recordConnection(){},generation:0,historyWindow:null,historyLoading:false,returningLive:false,status:null,serverReachable:true,
    sequence:Object.assign(frames(end,2),{dueThrough:liveDueThrough(end+300)}),sequenceHours:2,pending:null,displayed:{time:end},playing:false,liveRequestKey:'',mapUpdateVisible:false,serverClock:null,sequenceEnd:end,archiveRevision:null,performance,
    playbackHours:()=>hours,mapIdentity:'map',appVersion:'test',AbortSignal,liveDueThrough,ageLiveCoverage,
    $:id=>nodes[id]??={textContent:'',dataset:{}},window:{addEventListener:(name,fn)=>events[name]=fn},frameLoader:{cancel(){}},
    fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({mapId:'map',end,dueThrough:liveDueThrough(end+300),serverTime:(end+300)*1000,frames:frames(end,hours)})};},
    decodeFrames:async offered=>{if(decodeGate)await decodeGate;return offered;},
    adopt(next,preserve){adoptions.push({next,preserve});c.sequence=next;c.sequenceHours=next.windowHours;c.sequenceEnd=next.windowEnd;},
    paintHistory(){},paintStatus(){},paintMapUpdate(){},location:{reload(){throw Error('unexpected reload');}}});
  vm.runInContext(pollCode,c);
  return {c,requests,adoptions,nodes,change(value){hours=value;events['radar-playback-window']();},setEnd(value){end=value;},gate(value){decodeGate=value;}};
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('paused Live duration changes use status windows without archive requests',async()=>{
  const h=harness();h.change(6);await turn();
  assert.equal(h.c.playing,false);assert.equal(h.adoptions.at(-1).preserve,true);
  assert.equal(h.adoptions.at(-1).next.length,37);
  await h.c.poll();assert.equal(h.requests.filter(url=>url.startsWith('/api/archive')).length,0);
  h.setEnd(60600);await h.c.poll();assert.equal(h.adoptions.at(-1).next.at(-1).time,60600);
  h.change(4);await turn();assert.equal(h.adoptions.at(-1).next.length,25);
});
test('rapid changes during decode discard the obsolete window and converge on the latest choice',async()=>{
  const h=harness();let release;h.gate(new Promise(resolve=>release=resolve));
  h.change(6);await turn();h.change(4);h.change(2);
  h.gate(null);release();await turn();await turn();
  assert.equal(h.adoptions.length,1);assert.equal(h.adoptions[0].next.windowHours,2);
  assert.equal(h.c.pending,null);assert.equal(h.requests.filter(url=>url.startsWith('/api/status')).length,2);
});
test('saved Live duration changes leave an active Archive visit alone',()=>{
  const h=harness();const loads=[];h.c.loadHistory=(end,preserve)=>loads.push({end,preserve});
  h.c.historyWindow={end:10000};h.change(6);
  assert.equal(h.requests.length,0);assert.equal(h.adoptions.length,0);
  assert.deepEqual(loads,[]);
  h.c.historyLoading=true;h.c.historyTargetEnd=20000;h.change(4);
  assert.deepEqual(loads,[]);
});

test('archive pruning revisions never reload a selected window',async()=>{
 const h=harness();let loads=0;h.c.loadHistory=()=>loads++;h.c.historyWindow={end:10000};h.c.archiveRevision='old';await h.c.poll();assert.equal(loads,0);assert.equal(h.c.historyWindow.end,10000);
});
