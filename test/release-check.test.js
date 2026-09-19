import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compareReleases,createReleaseCheck} from '../src/release-check.js';
import {releaseText} from '../public/release-ui.js';
const row=(v,prerelease=false)=>({tag_name:'v'+v,prerelease,draft:false,published_at:'2026-09-19T12:00:00Z'});
const response=(rows,headers={})=>new Response(JSON.stringify(rows),{headers});
async function dir(t){const d=await mkdtemp(join(tmpdir(),'radar-release-'));t.after(()=>rm(d,{recursive:true,force:true}));return d;}
test('distinct published versions use numeric semantic ordering and transition breakdown',()=>{
  const rows=['0.5.0','0.6.1','0.5.1','0.6.0','0.6.1'].map(v=>row(v,true));
  const result=compareReleases('0.5.0',rows);
  assert.equal(result.count,3);assert.deepEqual(result.breakdown,{major:0,minor:1,patch:2,prerelease:0});assert.equal(result.prereleases,3);
  assert.equal(compareReleases('0.9.0',[row('0.10.0')]).newest,'0.10.0');
  assert.equal(compareReleases('1.0.0',[row('2.0.0')]).breakdown.major,1);
  assert.equal(compareReleases('0.6.0',[row('0.5.9'),row('0.6.0')]).state,'current');
});
test('prerelease suffixes, promotion, unpublished and incomplete histories are honest',()=>{
  assert.equal(compareReleases('1.0.0-rc.2',[row('1.0.0-rc.10'),row('1.0.0')]).count,2);
  assert.equal(compareReleases('1.0.0-rc.2',[row('1.0.0')]).breakdown.prerelease,1);
  assert.equal(compareReleases('0.5.0',[row('0.5.0',false)]).count,0);
  assert.equal(compareReleases('0.5.0+build.2',[row('0.5.0')]).count,0);
  assert.equal(compareReleases('0.5.0+build.2',[row('0.5.0')]).state,'unknown');
  for(const v of ['dev','9.0.0'])assert.equal(compareReleases(v,[row('0.5.0')]).state,'unknown');
  assert.equal(compareReleases('0.5.0',[]).state,'unknown');
  assert.equal(compareReleases('0.5.0',[{...row('0.6.0'),draft:true}]).count,0);
  assert.equal(compareReleases('0.5.0',[{...row('0.6.0'),published_at:null}]).count,0);
  assert.equal(compareReleases('0.5.0',[row('0.5.0'),row('invalid')]).state,'unknown');
  const partial=compareReleases('0.5.0',[row('0.6.0')],false);assert.equal(partial.breakdown,null);assert.equal(partial.complete,false);
});
test('cache survives restart, deduplicates concurrent checks, and browser reads never fetch',async t=>{
  const directory=await dir(t);let now=100000,calls=0;
  const options={now:()=>now,fetcher:async()=>{calls++;return response([row('0.5.0'),row('0.6.0',true)]);}};
  const checker=await createReleaseCheck(directory,'0.5.0',options);
  await Promise.all([checker.check(),checker.check()]);for(let i=0;i<20;i++)checker.status();assert.equal(calls,1);
  const restarted=await createReleaseCheck(directory,'0.5.0',options);await restarted.check();assert.equal(calls,1);assert.equal(restarted.status().count,1);
  now+=86400001;assert.equal(restarted.status().stale,true);await restarted.check();assert.equal(calls,2);assert.equal(restarted.status().stale,false);
});
test('failed first check persists cadence and rate-limit retry time across restart',async t=>{
  const directory=await dir(t);let now=100000,calls=0;
  const options={now:()=>now,fetcher:async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'172800'}});}};
  const checker=await createReleaseCheck(directory,'0.5.0',options);await checker.check();assert.match(checker.status().error,/rate limit/);
  now+=86400001;const restarted=await createReleaseCheck(directory,'0.5.0',options);await restarted.check();assert.equal(calls,1);
});
test('pagination bounded at three pages and does not follow arbitrary Link URLs',async t=>{
  let calls=0;const checker=await createReleaseCheck(await dir(t),'0.5.0',{fetcher:async url=>{assert.match(url,/^https:\/\/api.github.com\/repos\/alex-soul\/pi-rain-radar\/releases\?/);calls++;return response([row('0.6.'+calls)],{link:'<https://untrusted.invalid/>; rel="next"'});}});
  await checker.check();assert.equal(calls,3);assert.equal(checker.status().complete,false);assert.equal(checker.status().count,3);
});
test('malformed, oversized and timed-out checks remain unknown without rapid retry',async t=>{
  for(const fetcher of [async()=>response({error:'bad'}),async()=>response([{}]),async()=>new Response('x'.repeat(2100000)),async()=>{throw new DOMException('timed out','TimeoutError');}]){
    const checker=await createReleaseCheck(await dir(t),'0.5.0',{fetcher});await checker.check();assert.equal(checker.status().state,'unknown');assert.ok(checker.status().error);
  }
});
test('failed refresh retains dated last-good result; bubbles distinguish stale and unknown',async t=>{
  let now=100000,fail=false;const checker=await createReleaseCheck(await dir(t),'0.5.0',{now:()=>now,fetcher:async()=>fail?new Response('{}',{status:500}):response([row('0.5.0')])});
  await checker.check();assert.match(releaseText(checker.status()).summary,/up to date/);
  fail=true;now+=86400001;await checker.check();assert.equal(checker.status().checkedAt,100000);assert.match(releaseText(checker.status()).summary,/last successful check/);
  assert.match(releaseText({}).summary,/unavailable/);
  assert.match(releaseText({...compareReleases('0.5.0',[row('0.6.0')],false),stale:true}).summary,/At least 1 release behind/);
});
