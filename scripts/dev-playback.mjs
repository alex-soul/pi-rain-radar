// Disposable, loopback-only playback fixture; no provider acquisition.
import {createServer as http} from 'node:http';
import {createServer as net} from 'node:net';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import {defaultSettings,defaultViews,hash} from '../src/map.js';

const directory=await mkdtemp(join(tmpdir(),'pi-rain-radar-next-release-preview-'));
await mkdir(join(directory,'settings'));
await writeFile(join(directory,'settings/map.json'),JSON.stringify({...defaultSettings,name:'DEV · Synthetic radar'}));
await writeFile(join(directory,'settings/radar.json'),JSON.stringify({waitForSettle:false,main:'rainviewer',overview:'rainbow',monthlyLimit:null}));
const end=Math.floor(Date.now()/600000)*600;
for(let i=0;i<=144;i++)for(const [view,key] of [[defaultViews.view,defaultViews.viewKey],[defaultViews.overviewView,hash({source:'rainbow',originalKey:defaultViews.overviewKey})]]) {
  const x=(i*17)%(view.width+400)-200,y=view.height*.5+Math.sin(i/8)*view.height*.2;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}"><g opacity=".8"><ellipse cx="${x}" cy="${y}" rx="${view.width*.16}" ry="${view.height*.18}" fill="#55b6bb"/><ellipse cx="${x-25}" cy="${y-10}" rx="${view.width*.08}" ry="${view.height*.09}" fill="#388ac7"/><ellipse cx="${x-35}" cy="${y-18}" rx="${view.width*.035}" ry="${view.height*.04}" fill="#6760ab"/></g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(directory,`${end-(144-i)*600}-${key}.png`));
}
const reservation=net();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
const internalPort=reservation.address().port;await new Promise(r=>reservation.close(r));
const origin=`http://127.0.0.1:${internalPort}`;
const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,DATA_DIR:directory,PORT:String(internalPort),BIND_ADDRESS:'127.0.0.1',RADAR_MANUAL_REFRESH:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stderr.on('data',data=>process.stderr.write(data));
await new Promise((resolve,reject)=>{child.stdout.on('data',data=>{if(String(data).includes('listening on port'))resolve();});child.once('exit',()=>reject(Error('Fixture backend exited')));});
let scenario='mixed',revision=1;
let demoKey=false,demoRadar={waitForSettle:false,main:'rainviewer',overview:'rainbow',monthlyLimit:null};
const controls=()=>`<!doctype html><meta charset="utf-8"><title>Playback DEV controls</title><h1>Synthetic playback review</h1><p>This controls only the disposable local preview. No Pi or provider is connected.</p><p>Current scenario: <strong>${scenario}</strong></p><form method="post" action="/__scenario">${['mixed','healthy','one','empty','recovered','source-error','unreachable'].map(s=>`<button name="scenario" value="${s}">${s}</button>`).join(' ')}</form><p>Mixed: isolated Main gaps, a 50-minute Overview outage and one both-map gap. Recovered fills all gaps. One/empty exercise automatic pause; changing to recovered exercises resume.</p><p><a href="/" target="_blank">Open radar preview</a></p><p>Updates appear within 15 seconds. Archive can be extended to 24 h. Use synthetic data only; do not enter real keys.</p>`;
function filterWindow(data) {
  if(!Array.isArray(data.frames))return data;
  let frames=data.frames.map(f=>({...f}));
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
  return {...data,frames,frame:frames.at(-1)??null,coverage,playable:frames.length,complete:coverage.every(c=>c.main&&c.overview),counts:Object.fromEntries(['main','overview'].map(role=>[role,{available:coverage.filter(c=>c[role]).length,missing:coverage.filter(c=>!c[role]).length}]))};
}
const server=http(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://127.0.0.1:3091');
    if(path.pathname==='/__dev'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(controls());}
    if(path.pathname==='/__scenario'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      const next=new URLSearchParams(body).get('scenario');
      if(['mixed','healthy','one','empty','recovered','source-error','unreachable'].includes(next)){scenario=next;revision++;}
      res.writeHead(303,{Location:'/__dev'});return res.end();
    }
    const send=data=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(path.pathname==='/api/settings/rainbow') {
      if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;demoKey=!!JSON.parse(body).apiKey;}
      return send({configured:demoKey,usage:{tiles:0,requests:0},tilesPerView:{main:6,overview:6}});
    }
    if(path.pathname==='/api/settings/radar'&&req.method==='POST') {
      let body='';for await(const chunk of req)body+=chunk;demoRadar=JSON.parse(body);return send({status:200});
    }
    if(['/api/settings/unlock','/api/settings/lock','/api/settings/activity','/api/settings/pin'].includes(path.pathname)&&req.method==='POST') {
      let body='';for await(const chunk of req)body+=chunk;
      const response=await fetch(origin+req.url,{method:'POST',headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},body});
      res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(await response.text());
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(403);return res.end('Playback fixture is read-only');}
    const response=await fetch(origin+req.url,{method:req.method});
    if(path.pathname==='/api/settings'&&response.ok){const data=await response.json();return send({...data,radar:demoRadar});}
    if(path.pathname==='/api/status' && scenario==='unreachable'){res.writeHead(503);return res.end('Synthetic connection failure');}
    if(path.pathname==='/api/status'||path.pathname==='/api/archive'){
      const data=filterWindow(await response.json());
      if(path.pathname==='/api/status'){
        data.archiveRevision=`fixture-${revision}-${data.archiveRevision}`;
        if(data.sources)for(const source of Object.values(data.sources)){source.time=end;source.checkedAt=new Date(end*1000).toISOString();source.nextCheckAt=Math.ceil(Date.now()/300000)*300000;source.state=scenario==='source-error'?'warning':'ready';source.error=scenario==='source-error'?'Synthetic provider unavailable':null;}
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
