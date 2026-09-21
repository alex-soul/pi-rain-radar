import {formatTime} from '../public/time.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {mapObservation,playbackState,frameProvider} from '../public/playback.js';
import {radarSourceHealth} from '../public/health.js';
import {liveDueThrough} from '../public/live-window.js';

test('embed requests only Main images, isolates LED health, retains cached playback and recovers',async()=>{
  const source=(await readFile(new URL('../public/embed.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
  const nodes=new Map(),images=[],timers=[];
  const node=()=>({dataset:{},style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},removeAttribute(k){delete this.attributes[k];},replaceChildren(){}});
  const metadata={'embed-hours':'2','embed-speed':'1','map-id':'fixture','app-version':'test','time-zone':'Europe/London'};
  let now=Date.now(),online=true;
  let result={mapId:'fixture',appVersion:'test',serverTime:now,end:now/1000,frames:[{time:now/1000-600,url:'/main-1',overviewUrl:'/overview-1',source:'rainviewer'},{time:now/1000,url:'/main-2',overviewUrl:'/overview-2',source:'rainviewer'}],sources:{main:{time:now/1000,state:'ready'},overview:{time:now/1000-1900,state:'stale'}}};
  const context=vm.createContext({formatTime,document:{querySelector:selector=>({content:metadata[selector.match(/name="([^"]+)"/)[1]]}),getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,createTextNode:()=>node()},createFrameLoader:()=>({load:async frames=>frames,prepare:async url=>{images.push(url);return {};}}),mapObservation,playbackState,frameProvider,radarSourceHealth,liveDueThrough,performance:{now:()=>now},Date,AbortSignal,fetch:async()=>({ok:online,json:async()=>structuredClone(result)}),setInterval(){},setTimeout:callback=>timers.push(callback),location:{reload(){throw new Error('Unexpected reload');}}});
  vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
  const led=nodes.get('embed-status');assert.equal(led.dataset.health,'ready');
  assert.match(nodes.get('embed-time').textContent,/^\d{2}:\d{2}$/);
  assert.ok(images.length>0);assert.ok(images.every(url=>url.startsWith('/main-')));
  result.sources.main.time=now/1000-1800;await context.poll();assert.equal(led.dataset.health,'error');
  result.sources.main={time:now/1000,state:'warning',error:'Delayed'};await context.poll();assert.equal(led.dataset.health,'warning');
  online=false;await context.poll();assert.equal(led.dataset.health,'error');
  const before=images.length;timers.at(-1)();await Promise.resolve();assert.ok(images.length>before,'Cached sequence continues while offline');
  online=true;result.sources.main={time:now/1000,state:'ready'};await context.poll();assert.equal(led.dataset.health,'ready');
  result.frames=[result.frames[0]];await context.poll();const still=images.length;timers.at(-1)();assert.equal(images.length,still,'Single frame automatically waits');
  result.frames.push({time:now/1000,url:'/main-2',source:'rainviewer'});await context.poll();const recovered=images.length;timers.at(-1)();await Promise.resolve();assert.ok(images.length>recovered,'Two frames resume automatically');
});
