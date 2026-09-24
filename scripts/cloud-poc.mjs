// Explicit one-shot acquisition and credential-free replay. Never scheduled.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import sharp from 'sharp';
import {makeViews,radarTiles,mapAssetId} from '../src/map.js';
import {prepareMapAssets} from '../src/map-assets.js';
import {mapPage} from '../src/map-page.js';
const exec=promisify(execFile),mode=process.argv[2],root=process.argv[3]&&resolve(process.argv[3]);
async function ssh(command){try{return (await exec('ssh',['-o','BatchMode=yes','pi-weather',command],{encoding:'buffer',maxBuffer:16*1024*1024,timeout:30000,windowsHide:true})).stdout;}catch{throw Error('Pi read failed; no remote mutation was attempted.');}}
const dataRoot='/var/lib/docker/volumes/pi-rain-radar_radar-data/_data';
const json=async command=>JSON.parse((await ssh(command)).toString());
const save=(dir,name,value)=>writeFile(join(dir,name),JSON.stringify(value,null,2),{mode:0o600});
async function plan(){
 const directory=await mkdtemp(join(tmpdir(),'pi-rain-radar-cloud-poc-'));
 const settings=await json(`sudo cat ${dataRoot}/settings/map.json`);
 const usage=await json(`sudo cat ${dataRoot}/settings/rainbow-usage.json`);
 const view=makeViews(settings).view,tiles=radarTiles(view),requests=1+13*tiles.length;
 const report={directory,plannedAt:new Date().toISOString(),tilesPerFrame:tiles.length,frames:13,requests,ceiling:250,publicPriceUSDPer1000:.20,estimatedMaxUSD:requests*.0002,monthlyCloudTiles:tiles.length*144*31,piUsage:usage,settings};
 await save(directory,'plan.json',report);console.log(JSON.stringify(report));
}
async function acquire(directory){
 const plan=JSON.parse(await readFile(join(directory,'plan.json')));
 if(plan.requests>250)throw Error('Planned requests exceed the approved ceiling.');
 try{await access(join(directory,'manifest.json'));throw Error('Dataset already acquired; use serve.');}catch(e){if(e.code!=='ENOENT')throw e;}
 // An interrupted run is not retried automatically: its ledger remains evidence.
 try{await access(join(directory,'requests.json'));throw Error('Acquisition already attempted; inspect its ledger before any retry.');}catch(e){if(e.code!=='ENOENT')throw e;}
 let keyBytes=await ssh(`sudo cat ${dataRoot}/settings/rainbow.json`),key=JSON.parse(keyBytes.toString()).apiKey;keyBytes.fill(0);keyBytes=null;
 let requests=0,bytes=0;const failures=[];
 async function request(path){
  if(requests>=250)throw Error('POC request ceiling reached.');
  requests++;await save(directory,'requests.json',{requests,bytes,failures});
  let response;try{response=await fetch('https://api.rainbow.ai'+path,{headers:{'Ocp-Apim-Subscription-Key':key},signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw Error('Rainbow request failed (no automatic retry).');}
  if(!response.ok){await response.body?.cancel();if([401,403,429].includes(response.status))throw Error('Rainbow stopped acquisition: HTTP '+response.status);failures.push({path,status:response.status});return null;}
  const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>2*1024*1024)throw Error('Rainbow response exceeded bound.');chunks.push(chunk);}bytes+=length;
  await new Promise(r=>setTimeout(r,850));return Buffer.concat(chunks);
 }
 try{
  const snapshotBytes=await request('/tiles/v1/snapshot?layer=clouds');if(!snapshotBytes)throw Error('Cloud snapshot unavailable.');
  const end=JSON.parse(snapshotBytes).snapshot;if(!Number.isSafeInteger(end)||end%600!==0||Math.abs(Date.now()/1000-end)>10800)throw Error('Unexpected cloud snapshot time.');
  const window=await json(`curl -fsS 'http://127.0.0.1:3080/api/archive?end=${end}&hours=2'`);
  const view=makeViews(plan.settings).view,tiles=radarTiles(view),frames=[];
  await mkdir(join(directory,'media'));
  for(let time=end-7200;time<=end;time+=600){
   const overlays=[];let complete=true;
   for(const tile of tiles){
    const raw=await request(`/tiles/v1/clouds/${time}/${tile.zoom}/${tile.x}/${tile.y}`);if(!raw){complete=false;continue;}
    const info=await sharp(raw,{limitInputPixels:65536}).metadata();if(info.width!==256||info.height!==256)throw Error('Unexpected cloud tile dimensions.');
    const left=Math.max(0,tile.left),top=Math.max(0,tile.top),width=Math.min(view.width,tile.left+tile.size)-left,height=Math.min(view.height,tile.top+tile.tileHeight)-top;
    overlays.push({input:await sharp(raw).resize(tile.size,tile.tileHeight).extract({left:left-tile.left,top:top-tile.top,width,height}).png().toBuffer(),left,top});
   }
   const url=complete?`/poc-media/cloud-${time}.png`:null;
   if(complete)await sharp({create:{width:view.width,height:view.height,channels:4,background:'#0000'}}).composite(overlays).png().toFile(join(directory,'media',`cloud-${time}.png`));
   const rain=window.frames.find(f=>f.time===time&&f.url&&(f.mainTime??f.time)===time);
   let rainUrl=null;
   if(rain){if(!/^\/archive\/media\/[a-zA-Z0-9/_.-]+\.png$/.test(rain.url))throw Error('Unexpected archive asset path.');
    const raw=await ssh(`curl -fsS 'http://127.0.0.1:3080${rain.url}'`),info=await sharp(raw).metadata();if(info.width!==view.width||info.height!==view.height)throw Error('Pi rain geometry differs from cloud view.');
    await writeFile(join(directory,'media',`rain-${time}.png`),raw);rainUrl=`/poc-media/rain-${time}.png`;
   }
   frames.push({time,url,rainUrl,rainSource:rain?.source??null});console.log(JSON.stringify({frame:frames.length,requests,cloud:!!url,rain:!!rainUrl}));
  }
  await prepareMapAssets(plan.settings,join(directory,'maps',mapAssetId(plan.settings)));
  const manifest={start:end-7200,end,frames,requests,bytes,failures,settings:plan.settings,acquiredAt:new Date().toISOString(),continuousCollection:false};
  await save(directory,'manifest.json',manifest);await save(directory,'requests.json',{requests,bytes,failures});
  console.log(JSON.stringify({complete:true,directory,requests,bytes,cloudFrames:frames.filter(f=>f.url).length,rainFrames:frames.filter(f=>f.rainUrl).length}));
 }finally{key='';}
}
async function serve(directory){
 const manifest=JSON.parse(await readFile(join(directory,'manifest.json'))),settings=manifest.settings,id=mapAssetId(settings);
 const frames=manifest.frames.map(f=>({time:f.time,url:f.rainUrl,source:f.rainSource,mainTime:f.rainUrl?f.time:null,overviewUrl:null,expectedSources:{main:'rainviewer',overview:'disabled'}}));
 const coverage=frames.map(f=>({time:f.time,main:!!f.url,overview:false,sources:f.expectedSources}));
 const status={start:manifest.start,end:manifest.end,dueThrough:manifest.end,frames,frame:frames.at(-1),coverage,borrowFrames:[],complete:frames.every(f=>f.url),playable:frames.length,cloudDemo:{frames:manifest.frames.filter(f=>f.url).map(({time,url})=>({time,url}))},
  now:manifest.end*1000,mapId:id,mapUpdate:{busy:false},sources:{main:{source:'rainviewer',enabled:true,state:'ready',lastSuccess:manifest.end*1000},overview:{source:'disabled',enabled:false,state:'disabled'}},weather:{configured:false},camera:{configured:false,enabled:false},stats:{rainbow:{requests:manifest.requests,tiles:manifest.requests-1}},appVersion:JSON.parse(await readFile('package.json')).version};
 const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'");
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end('Read-only POC');}
  if(path==='/api/status'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(status));}
  if(path==='/api/camera'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({records:[],latest:null,counts:{},status:status.camera}));}
  if(path==='/api/settings/auth'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({configured:false}));}
  if(path==='/api/settings'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({locked:false,pinSet:false,map:settings,radar:{main:'rainviewer',overview:'disabled'},weather:{configured:false},rainbow:{configured:false}}));}
  if(path==='/'){let html=mapPage(await readFile('public/index.html','utf8'),{settings,id});html=html.replace('</body>','<div class="cloud-poc-banner">DEV · Recorded two-hour cloud POC · Collection stopped · Clouds © Rainbow</div></body>');res.setHeader('Content-Type','text/html');return res.end(html);}
  if(!/^\/[a-zA-Z0-9/_.-]+$/.test(path)||path.includes('..'))throw Error();
  let file=path.startsWith('/poc-media/')?join(directory,'media',path.slice(11)):path.startsWith('/maps/')?join(directory,path):join('public',path);
  const ext=path.slice(path.lastIndexOf('.'));if(!mime[ext])throw Error();const body=await readFile(file);res.setHeader('Content-Type',mime[ext]);res.end(body);
 }catch{res.writeHead(404);res.end('Not available in this read-only cloud POC');}});
 server.listen(3092,'127.0.0.1',()=>console.log(JSON.stringify({preview:'http://127.0.0.1:3092/',pid:process.pid,directory,continuousCollection:false})));
}
try{if(mode==='plan')await plan();else if(mode==='fetch'&&root)await acquire(root);else if(mode==='serve'&&root)await serve(root);else throw Error('Use plan, fetch DIRECTORY, or serve DIRECTORY');}catch(error){console.error('POC stopped safely. Inspect the non-secret request ledger and completed frame log.');process.exitCode=1;}
