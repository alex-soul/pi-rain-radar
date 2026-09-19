import {createDiagnostics} from '../src/diagnostics.js';
import {createHealthEvents} from '../src/health-events.js';
import { scenarios as scenarioCatalog, controlsPage } from './dev-scenarios.mjs';
// Disposable, loopback-only playback fixture; no provider acquisition.
import {createServer as http} from 'node:http';
import {createServer as net} from 'node:net';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import {defaultSettings,defaultViews,hash} from '../src/map.js';

const directory=await mkdtemp(join(tmpdir(),'pi-rain-radar-next-release-preview-'));
const simulationId=Date.now().toString(36);
await mkdir(join(directory,'settings'));
await writeFile(join(directory,'settings/embed.json'),JSON.stringify({enabled:true,origins:['http://127.0.0.1:3091'],hours:2,speed:1,theme:'dark'}));
await writeFile(join(directory,'settings/map.json'),JSON.stringify({...defaultSettings,name:'DEV · Synthetic radar'}));
await writeFile(join(directory,'settings/radar.json'),JSON.stringify({waitForSettle:false,main:'rainviewer',overview:'rainbow',monthlyLimit:null}));
const end=Math.floor(Date.now()/600000)*600;
for(let i=0;i<=144;i++)for(const [view,key] of [[defaultViews.view,defaultViews.viewKey],[defaultViews.overviewView,hash({source:'rainbow',originalKey:defaultViews.overviewKey})]]) {
  // Scale motion to each viewport so the smaller Overview always shows rain too.
  const x=view.width*(.5+Math.sin(i/10)*.3),y=view.height*(.5+Math.sin(i/8)*.2);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}"><g opacity=".8"><ellipse cx="${x}" cy="${y}" rx="${view.width*.16}" ry="${view.height*.18}" fill="#55b6bb"/><ellipse cx="${x-25}" cy="${y-10}" rx="${view.width*.08}" ry="${view.height*.09}" fill="#388ac7"/><ellipse cx="${x-35}" cy="${y-18}" rx="${view.width*.035}" ry="${view.height*.04}" fill="#6760ab"/></g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(directory,`${end-(144-i)*600}-${key}.png`));
}
const reservation=net();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
const internalPort=reservation.address().port;await new Promise(r=>reservation.close(r));
const origin=`http://127.0.0.1:${internalPort}`;
const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,DATA_DIR:directory,PORT:String(internalPort),BIND_ADDRESS:'127.0.0.1',RADAR_MANUAL_REFRESH:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stderr.on('data',data=>process.stderr.write(data));
await new Promise((resolve,reject)=>{child.stdout.on('data',data=>{if(String(data).includes('listening on port'))resolve();});child.once('exit',()=>reject(Error('Fixture backend exited')));});
const scenarios=scenarioCatalog.map(s=>s.id);
let scenario='healthy',revision=1;
const scenarioLog=createDiagnostics(),observeScenario=createHealthEvents(scenarioLog.record);
scenarioLog.record('startup');
let demoKey=false,demoRadar={waitForSettle:false,main:'rainviewer',overview:'rainbow',monthlyLimit:null};
const controls=()=>controlsPage(scenario);
function filterWindow(data) {
  if(!Array.isArray(data.frames))return data;
  // Production frames are immutable; regenerated fixtures must not reuse their browser cache.
  const imageUrl=url=>url?`${url}?simulation=${simulationId}`:url;
  let frames=data.frames.map(f=>({...f,url:imageUrl(f.url),overviewUrl:imageUrl(f.overviewUrl)}));
  if(scenario==='gap-outstanding')frames=frames.map(f=>f.time===end-1800?{...f,overviewUrl:null,overviewSource:null,overviewTime:null}:f);
  if(scenario==='empty')frames=[];
  else if(scenario==='one')frames=frames.filter(f=>f.time===end);
  else if(scenario==='mixed')frames=frames.map(f=>{
    const i=Math.round((end-f.time)/600);
    if(i%17===8){f.url=null;f.source=null;f.mainTime=null;}
    if(i>=2&&i<=6||i%29===16){f.overviewUrl=null;f.overviewSource=null;f.overviewTime=null;}
    if(i===9){f.url=null;f.overviewUrl=null;}
    return f;
  }).filter(f=>f.url||f.overviewUrl);
  const byTime=new Map(frames.map(f=>[f.time,f]));
  const coverage=(data.coverage??[]).map(c=>({...c,main:!!byTime.get(c.time)?.url,overview:!!byTime.get(c.time)?.overviewUrl}));
  const statsCases=['gap-grace','late-recovered','gap-outstanding','tracking-partial'];
  const incidents=role=>{
    const tracked=statsCases.includes(scenario)?coverage.filter(c=>scenario!=='tracking-partial'||c.time>=end-1800):[];
    const includes=time=>tracked.some(c=>c.time===time);
    const main=role==='main',late=['late-recovered','tracking-partial'].includes(scenario);
    return {total:coverage.length,tracked:tracked.length,
      gapsSeen:main?(late?Number(includes(end-1200))+Number(scenario==='late-recovered'&&includes(end-2400)):0):Number(statsCases.includes(scenario)&&includes(end-1800)),
      lateArrivals:Number(main&&late&&includes(end-1200))};
  };
  return {...data,frames,frame:frames.at(-1)??null,coverage,playable:frames.length,complete:coverage.every(c=>c.pending||(c.main&&c.overview)),counts:Object.fromEntries(['main','overview'].map(role=>[role,{...incidents(role),available:coverage.filter(c=>c[role]).length,missing:coverage.filter(c=>!c[role]&&!c.pending).length}]))};
}
const server=http(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://127.0.0.1:3091');
    const controlAssets={'/__dev/style.css':['dev-controls.css','text/css'],'/__dev/controls.js':['dev-controls.js','text/javascript']};
    if(controlAssets[path.pathname]) {const [file,type]=controlAssets[path.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(await readFile(new URL(file,import.meta.url)));}
    if(path.pathname==='/__dev'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(controls());}
    if(path.pathname==='/__embed'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end('<!doctype html><html><head><title>Embed review · synthetic radar</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#142623;color:#e1eee7;font:16px system-ui"><h1>Embed review · synthetic radar</h1><p>Change scenarios in the studio; both cards follow. Only Main radar affects their LEDs.</p><iframe title="Small embed" src="/embed" width="320" height="180"></iframe><iframe title="Tall embed" src="/embed" width="240" height="360"></iframe><p><a style="color:inherit" href="/__dev">Scenario studio</a></p></body></html>');}
    if(path.pathname==='/__scenario'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      const next=new URLSearchParams(body).get('scenario');
      if(!scenarios.includes(next)){res.writeHead(400);return res.end('Unknown scenario');}
      if(next!==scenario && ['weather-first','weather-second'].includes(next))scenarioLog.record('weather-error');
      scenario=next;revision++;
      if(req.headers.accept==='application/json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({scenario,revision}));}
      res.writeHead(303,{Location:'/__dev'});return res.end();
    }
    // Keep the out-of-band console usable while the entire application backend is offline.
    if(scenario==='unreachable' && (path.pathname.startsWith('/api/') || path.pathname==='/healthz')) {
      res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});
      return res.end('Synthetic backend unavailable');
    }
    const send=data=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(path.pathname==='/api/settings/rainbow') {
      if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;demoKey=!!JSON.parse(body).apiKey;}
      return send({configured:demoKey,usage:{tiles:0,requests:0},tilesPerView:{main:6,overview:6}});
    }
    // Synthetic acknowledgements only; power actions never reach the real host.
    if(path.pathname==='/api/settings/power') {
      if(req.method==='GET')return send({state:'ready',version:'synthetic-no-host-actions'});
      if(req.method==='POST') {
        let body='';for await(const chunk of req)body+=chunk;
        if(!['restart','shutdown'].includes(JSON.parse(body).action)){res.writeHead(400);return res.end('{}');}
        res.writeHead(202,{'Content-Type':'application/json','Cache-Control':'no-store'});
        return res.end(JSON.stringify({accepted:true,synthetic:true}));
      }
      res.writeHead(405);return res.end();
    }
    if(path.pathname==='/api/releases') {
      if(scenario==='release-unknown')return send({state:'unknown',error:'Could not check published releases.',checkedAt:null});
      const behind=['release-behind','release-stale','release-partial'].includes(scenario);
      return send({state:behind?'behind':'current',count:behind?3:0,breakdown:scenario==='release-partial'?null:{major:0,minor:1,patch:2,prerelease:0},prereleases:behind?3:0,newest:behind?'0.6.1':'0.5.0',complete:scenario!=='release-partial',checkedAt:Date.now()-(scenario==='release-stale'?172800000:60000),stale:scenario==='release-stale',error:scenario==='release-stale'?'Could not check published releases.':null});
    }
    if(path.pathname==='/api/settings/radar'&&req.method==='POST') {
      let body='';for await(const chunk of req)body+=chunk;demoRadar=JSON.parse(body);return send({status:200});
    }
    if(['/api/settings/unlock','/api/settings/lock','/api/settings/activity','/api/settings/pin','/api/settings/embed'].includes(path.pathname)&&req.method==='POST') {
      let body='';for await(const chunk of req)body+=chunk;
      const response=await fetch(origin+req.url,{method:'POST',headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},body});
      res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(await response.text());
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(403);return res.end('Playback fixture is read-only');}
    const response=await fetch(origin+req.url,{method:req.method,headers:req.headers.authorization?{Authorization:req.headers.authorization}:{}});
    if(path.pathname==='/api/settings/diagnostics'&&response.ok) return send(scenarioLog.snapshot());
    if(path.pathname==='/api/settings'&&response.ok){const data=await response.json();return send({...data,radar:demoRadar});}
    if(path.pathname==='/api/status'||path.pathname==='/api/archive'){
      const data=filterWindow(await response.json());
      if(path.pathname==='/api/status'){
        data.archiveRevision=`fixture-${revision}-${data.archiveRevision}`;
        if(data.sources)for(const source of Object.values(data.sources)){source.time=Math.floor(Date.now()/600000)*600;source.checkedAt=new Date(end*1000).toISOString();source.nextCheckAt=Math.ceil(Date.now()/300000)*300000;source.state=scenario==='source-error'?'warning':'ready';source.error=scenario==='source-error'?'Synthetic provider unavailable':null;}
      }
      if(path.pathname==='/api/status') {
        const now=Date.now(),minute=Math.floor(now/60000)*60;
        data.weather={configured:true,fetchedAt:now,forecastFetchedAt:now,failures:0,data:{current:{time:minute,temperature:14,feelsLike:12,windMph:9,humidity:72,windDirection:245},minutely:Array.from({length:60},(_,i)=>({time:minute+i*60,precipitation:i>15&&i<35?1:0}))}};
        if(scenario==='main-stale'||scenario==='overview-stale') Object.assign(data.sources[scenario==='main-stale'?'main':'overview'],{time:now/1000-1800,state:'warning',error:'Synthetic delayed provider'});
        if(scenario==='startup'||scenario==='first-failure') {
          for(const source of Object.values(data.sources)) Object.assign(source,{time:null,checkedAt:scenario==='startup'?null:now,fetching:scenario==='startup',error:scenario==='startup'?null:'Synthetic first acquisition failure',state:'waiting'});
          data.weather={configured:true,fetching:scenario==='startup',error:scenario==='startup'?null:'Synthetic first acquisition failure'};
        }
        if(scenario==='weather-first'||scenario==='weather-second') Object.assign(data.weather,{failures:scenario==='weather-first'?1:2,error:'Synthetic current weather failure'});
        if(scenario==='forecast-failed')data.weather.forecastError='Synthetic forecast failure';
        if(scenario==='forecast-partial')data.weather.data.minutely.splice(20,5);
        if(scenario==='weather-expired'){data.weather.data.current.time=minute-1800;data.weather.forecastFetchedAt=now-1800000;}
        if(scenario==='current-expired')data.weather.data.current.time=minute-1800;
        if(scenario==='forecast-expired')data.weather.forecastFetchedAt=now-1800000;
        if(scenario==='no-key')data.weather={configured:false};
        observeScenario(data.sources,data.weather);
      }
      res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(data));
    }
    const headers=Object.fromEntries(response.headers);delete headers['content-encoding'];delete headers['transfer-encoding'];
    const body=Buffer.from(await response.arrayBuffer());headers['content-length']=body.length;
    res.writeHead(response.status,headers);res.end(body);
  }catch{res.writeHead(502);res.end('Synthetic backend unavailable');}
});
server.listen(3091,'127.0.0.1',()=>console.log(JSON.stringify({preview:'http://127.0.0.1:3091',controls:'http://127.0.0.1:3091/__dev',directory,backendPid:child.pid,pid:process.pid})));
server.on('error',error=>{console.error(error.message);child.kill();process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.kill();server.close(()=>process.exit(0));});
