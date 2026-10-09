import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function harness(){
 const nodes=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},querySelector:()=>({textContent:''})});return nodes.get(id);};
 let online=true,decodes=0;
 const c=vm.createContext({$,fetch:async()=>{if(!online)throw Error('temporary timeout');return {ok:true,json:async()=>({end:100,dueThrough:100,frames:[{time:100,url:'/frame'}]})};},AbortSignal,Date,performance,generation:0,status:null,statsReceivedAt:0,appVersion:'test',mapIdentity:'map',serverReachable:true,serverClock:null,historyWindow:null,historyLoading:false,returningLive:false,liveRequestKey:'',sequence:[],pending:null,sequenceHours:2,playing:false,mapUpdateVisible:false,displayed:{time:100},location:{reload(){}},timeZone:'Europe/London',acceptIntegrationStatus(){},updateCloudSettings(){},paintMapUpdate(){},cameraSummary(){},paintStorageMeter(){},storageSummary(){},recordConnection(){},playbackHours:()=>2,decodeFrames:async f=>{decodes++;return f.map(x=>({...x}));},attachWindow:f=>f,adopt:f=>{c.sequence=f;},paintHistory(){},ageLiveWindow(){},showFrame(){},paintStatus(){}});
 vm.runInContext(app.slice(app.indexOf('let pollRunning = false;'),app.indexOf('void loadMapPlaces(assetIdentity);')),c);
 return {c,$,online:value=>{online=value;},decodes:()=>decodes};
}
test('same-window recovery clears the live warning without decoding or replacing cached radar',async()=>{
 const h=harness();await h.c.poll();const sequence=h.c.sequence;h.online(false);await h.c.poll();
 assert.match(h.$('playback-window-note').textContent,/Could not load/);assert.equal(h.c.serverReachable,false);
 h.online(true);await h.c.poll();assert.equal(h.$('playback-window-note').textContent,'');
 assert.equal(h.c.serverReachable,true);assert.equal(h.c.sequence,sequence);assert.equal(h.decodes(),1);
});
test('continuing failures retain the warning and cached radar',async()=>{
 const h=harness();await h.c.poll();const sequence=h.c.sequence;h.online(false);await h.c.poll();await h.c.poll();
 assert.match(h.$('playback-window-note').textContent,/retrying shortly/);assert.equal(h.c.sequence,sequence);
 assert.equal(h.c.serverReachable,false);
});
test('an unchanged successful poll preserves messages owned by Archive or other loading UI',async()=>{
 const h=harness();await h.c.poll();
 for(const [historyWindow,historyLoading,message] of [[{end:100},false,'No readable Archive available.'],[null,true,'Loading 24 hours…'],[null,false,'Returning to Live…']]){
  h.c.historyWindow=historyWindow;h.c.historyLoading=historyLoading;h.$('playback-window-note').textContent=message;
  await h.c.poll();assert.equal(h.$('playback-window-note').textContent,message);
 }
});
