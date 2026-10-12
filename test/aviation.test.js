import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createSettingsAuth,settingsRoutes,setPin} from '../src/settings-auth.js';
import {availabilityRows} from '../public/availability-model.js';
import {createHistoryStore} from '../src/history-store.js';
import {createAviation} from '../src/aviation.js';
import {decodeAviation} from '../src/aviation-decoder.js';
import {aviationAt,aviationHealth} from '../public/aviation-model.js';
const issued=Date.parse('2026-10-12T10:55:00Z');
const metar={icaoId:'EGBB',obsTime:issued/1000,rawOb:'METAR EGBB 121055Z 15012KT 3000 DZ OVC006 15/14 Q1011 REDZ',name:'Birmingham'};
const taf={icaoId:'EGBB',issueTime:new Date(issued).toISOString(),validTimeFrom:issued/1000+3900,validTimeTo:issued/1000+90000,rawTAF:'TAF EGBB 121055Z 1212/1312 17010KT 9999 OVC010 TEMPO 1212/1219 7000 -RADZ BKN006 PROB30 TEMPO 1300/1304 3000 RADZ BR BKN004'};
async function fixture(t,{freshInstallation=true,request}={}){
 const directory=await mkdtemp(join(tmpdir(),'aviation-test-'));let time=issued+10*60000,fail=false,empty=false,revision=0;
 const now=()=>++time;
 const store=await createHistoryStore(directory);
 let aviation;t.after(async()=>{await aviation?.close();await store.close();await rm(directory,{recursive:true,force:true});});
 const fetcher=async url=>new Response(fail?'':JSON.stringify(empty?[]:[url.includes('/metar?')?metar:{...taf,issueTime:new Date(issued+revision*60000).toISOString(),rawTAF:taf.rawTAF.replace('17010KT',revision?'18015G25KT':'17010KT')}]),{status:fail?503:200});
 aviation=await createAviation(directory,{store,freshInstallation,autoStart:false,fetcher:request??fetcher,now});
 return {directory,store,aviation,now,advance:ms=>time+=ms,setFail:v=>fail=v,setEmpty:v=>empty=v,amend:()=>revision++};
}
test('fresh defaults differ from upgrades; invalid configuration is rejected',async t=>{
 const {aviation}=await fixture(t,{freshInstallation:false});assert.equal(aviation.status().enabled,false);assert.equal(aviation.status().station,'EGBB');
 assert.equal((await aviation.configure({station:'https://example.com'})).status,400);
 assert.equal((await aviation.configure({enabled:true,station:' egbb '})).status,200);
});
test('Archive switches exactly at acquisition, not issue or validity; unchanged polls preserve first receipt',async t=>{
 const f=await fixture(t);await f.aviation.collect();let first=f.aviation.status().reports.taf;assert.equal(f.aviation.status().enabled,true);
 assert.ok(first.acquiredAt>first.issuedAt);assert.ok(first.validFrom>first.acquiredAt);
 f.advance(300000);await f.aviation.collect();assert.equal(f.aviation.status().reports.taf.acquiredAt,first.acquiredAt);
 f.amend();f.advance(300000);await f.aviation.collect();const second=f.aviation.status().reports.taf;
 const history=await f.aviation.history(Math.ceil(f.now()/1000),2);
 assert.equal(aviationAt(history,first.acquiredAt-1).reports.taf,null);
 assert.equal(aviationAt(history,first.acquiredAt).reports.taf.raw,first.raw);
 assert.equal(aviationAt(history,second.acquiredAt-1).reports.taf.raw,first.raw);
 assert.equal(aviationAt(history,second.acquiredAt).reports.taf.raw,second.raw);
 assert.equal(aviationAt(history,first.acquiredAt).reports.taf.raw,first.raw);
 assert.equal(history.reports.filter(r=>r.product==='taf').length,2);
});
test('unchanged reports are green, failed polling is retained amber, empty success is distinct, disabling preserves history',async t=>{
 const f=await fixture(t);await f.aviation.collect();assert.equal(aviationHealth(f.aviation.status(),'taf',f.now()),'ready');
 f.setFail(true);f.advance(300000);await f.aviation.collect();assert.equal(aviationHealth(f.aviation.status(),'taf',f.now()),'warning');
 f.setFail(false);f.setEmpty(true);f.advance(300000);await f.aviation.collect();assert.equal(aviationHealth(f.aviation.status(),'taf',f.now()),'error');
 const report=f.aviation.status().reports.taf;await f.aviation.configure({enabled:false});await f.aviation.collect();assert.equal(f.aviation.status().reports.taf.raw,report.raw);assert.equal(aviationHealth(f.aviation.status(),'taf',f.now()),'disabled');
 f.setEmpty(false);await f.aviation.configure({enabled:true});f.advance(1000);await f.aviation.collect();const history=await f.aviation.history(Math.ceil(f.now()/1000),2);assert.equal(aviationAt(history,f.now()).reports.taf.acquiredAt,report.acquiredAt);
});
test('old/mismatched station reports cannot replace the latest report',async t=>{
 const f=await fixture(t);await f.aviation.collect();await f.aviation.configure({station:'EGLL'});await f.aviation.collect();assert.equal(f.aviation.status().reports.taf,undefined);assert.equal(aviationHealth(f.aviation.status(),'taf',f.now()),'error');
});
test('decoding preserves exact text spans and explains only the selected group',()=>{
 const result=decodeAviation(taf.rawTAF,{product:'taf',station:'EGBB',issuedAt:issued});
 assert.equal(result.parseError,false);let rebuilt='',offset=0;
 for(const section of result.sections){rebuilt+=taf.rawTAF.slice(offset,section.start)+taf.rawTAF.slice(section.start,section.end);offset=section.end;}rebuilt+=taf.rawTAF.slice(offset);assert.equal(rebuilt,taf.rawTAF);
 const probability=result.sections.find(s=>taf.rawTAF.slice(s.start,s.end).startsWith('PROB30'));assert.match(probability.meaning,/30% probability/);assert.equal(taf.rawTAF.slice(probability.start,probability.end),'PROB30 TEMPO 1300/1304');
 assert.ok(result.sections.every(s=>!s.meaning.includes('Forecast section')));
 assert.equal(result.sections.find(s=>taf.rawTAF.slice(s.start,s.end)==='17010KT').meaning,'Wind from 170° true, 10 knots.');
 assert.match(result.sections.find(s=>taf.rawTAF.slice(s.start,s.end)==='TEMPO 1212/1219').meaning,/Period/);
 const unknown=decodeAviation(metar.rawOb+' XYZ',{product:'metar',station:'EGBB',observedAt:issued}).sections.at(-1);assert.equal(unknown.known,false);
});
test('disabling during a request cancels publication and creates a disabled boundary',async t=>{
 let entered;const started=new Promise(r=>entered=r);
 const f=await fixture(t,{request:async(url,{signal})=>new Promise((resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true});})});
 const collecting=f.aviation.collect();await started;await f.aviation.configure({enabled:false});await collecting;
 assert.deepEqual(f.aviation.status().reports,{});assert.equal(f.aviation.status().enabled,false);
});
test('Aviation settings require PIN authorization and same-origin bounded JSON',async t=>{
 const f=await fixture(t);await setPin(f.directory,'123456');const auth=createSettingsAuth(f.directory),handler=settingsRoutes(auth,null,null,{aviation:f.aviation});
 const server=createServer(async(req,res)=>{await handler(req,res,new URL(req.url,'http://localhost').pathname);});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}/api/settings/aviation`;
 assert.equal((await fetch(url)).status,401);const {token}=await auth.unlock('123456');const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 assert.equal((await fetch(url,{headers})).status,200);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{"enabled":false}'})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers,body:'{"station":"EGLL","enabled":false}'})).status,200);
 assert.equal((await fetch(url,{method:'POST',headers,body:'x'.repeat(1025)})).status,413);
 assert.equal(f.aviation.status().enabled,false);
});
test('availability follows collection independently of widget visibility and preserves partial product details',async t=>{
 const f=await fixture(t);await f.aviation.collect();f.advance(300000);f.setEmpty(true);await f.aviation.collect();const time=Math.ceil(f.now()/1000),aviationHistory=await f.aviation.history(time,2);
 const input={start:time-600,end:time,data:{aviationHistory},status:{aviation:f.aviation.status()}};
 let row=availabilityRows(input).find(r=>r.label==='Aviation');assert.equal(row.segments.at(-1).health,'error');assert.equal(row.segments.at(-1).detail.length,2);
 input.status.aviation.enabled=false;assert.equal(availabilityRows(input).some(r=>r.label==='Aviation'),false);
});
test('international month rollover uses the report issue date; unknown remarks remain original',()=>{
 const raw='TAF EGBB 312300Z 0100/0200 22012KT 9999 BKN020 BECMG 0102/0104 SCT030 RMK XYZ';
 const d=decodeAviation(raw,{product:'taf',station:'EGBB',issuedAt:Date.parse('2026-10-31T23:00:00Z')});
 assert.equal(d.parseError,false);assert.match(d.sections.find(s=>raw.slice(s.start,s.end)==='0100/0200').meaning,/2026-11-01 00:00 UTC/);assert.equal(d.sections.at(-1).known,false);
});
test('restart restores the original report acquisition and disabled preference without collecting',async t=>{
 const f=await fixture(t);await f.aviation.collect();const first=f.aviation.status().reports.taf;
 await f.aviation.configure({enabled:false});await f.aviation.close();await f.store.close();
 const store=await createHistoryStore(f.directory);let collector;
 try{collector=await createAviation(f.directory,{store,freshInstallation:true,autoStart:false,now:f.now,fetcher:()=>{throw Error('Unexpected request');}});assert.equal(collector.status().enabled,false);assert.equal(collector.status().reports.taf.acquiredAt,first.acquiredAt);const history=await collector.history(Math.ceil(f.now()/1000),2);assert.equal(aviationAt(history,first.acquiredAt).reports.taf.raw,first.raw);}finally{await collector?.close();await store.close();}
});
test('runway range, wind shear and fractional visibility explanations preserve meaningful groups',()=>{
 const raw='METAR EGBB 121055Z 15012KT 1 1/2SM R15/0800N BKN006 15/14 Q1011 WS020/19050KT';
 const decoded=decodeAviation(raw,{product:'metar',station:'EGBB',observedAt:issued});
 assert.equal(raw.slice(decoded.sections.find(s=>s.meaning.includes('statute miles')).start,decoded.sections.find(s=>s.meaning.includes('statute miles')).end),'1 1/2SM');
 assert.match(decoded.sections.find(s=>raw.slice(s.start,s.end)==='R15/0800N').meaning,/800 metres/);assert.match(decoded.sections.at(-1).meaning,/2000 ft/);
});
