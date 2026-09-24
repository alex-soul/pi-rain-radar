import {trendFixture} from './dev-weather-trends.mjs';
import {syntheticAvailability,syntheticMedia} from './dev-availability.mjs';
import {loadForecastRecording,applyForecastRecording} from './dev-forecast-recording.mjs';
import {disableRadarProviders,maskLiveRadar} from '../public/radar-policy.js';
import {saveWeatherHistory,weatherContext} from '../src/weather-history.js';
import {createDevCamera} from './dev-camera.mjs';
import {createDevWeather} from './dev-weather.mjs';
import {createHistoryStore} from '../src/history-store.js';
import {createDiagnostics} from '../src/diagnostics.js';
import {createHealthEvents} from '../src/health-events.js';
import { scenarios as scenarioCatalog, controlsPage } from './dev-scenarios.mjs';
// Disposable, loopback-only playback fixture; no provider acquisition.
import {createServer as http} from 'node:http';
import {createServer as net} from 'node:net';
import {mkdtemp,mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {defaultSettings,defaultViews,hash,makeViews} from '../src/map.js';

const cloudSeed=process.argv[2]==='--clouds'?process.argv[3]:null;
const trial=cloudSeed?join(cloudSeed,'continuous-trial-500'):null;
const recordingArg=process.argv.indexOf('--forecast-recording');
if(recordingArg>=0&&(!process.argv[recordingArg+1]||cloudSeed))throw Error('Use --forecast-recording with a local export, without --clouds');
const recording=await loadForecastRecording(recordingArg>=0?process.argv[recordingArg+1]:null);
let directory;
if(trial){await mkdir(trial,{recursive:true});try{directory=JSON.parse(await readFile(join(trial,'preview.json'))).directory;}catch(e){if(e.code!=='ENOENT')throw e;}}
if(!directory){directory=await mkdtemp(join(tmpdir(),'pi-rain-radar-next-release-preview-'));if(trial)await writeFile(join(trial,'preview.json'),JSON.stringify({directory}));}
const simulationId=Date.now().toString(36);
await mkdir(join(directory,'settings'),{recursive:true});
await writeFile(join(directory,'settings/embed.json'),JSON.stringify({enabled:true,origins:['http://127.0.0.1:3091'],hours:2,speed:1,theme:'dark'}));
await writeFile(join(directory,'settings/map.json'),JSON.stringify({...defaultSettings,name:'DEV · Synthetic radar'}));
await writeFile(join(directory,'settings/radar.json'),JSON.stringify({waitForSettle:false,main:'rainviewer',overview:'same',monthlyLimit:null}));
const seedStore=await createHistoryStore(directory);
const end=recording?.end??Math.floor(Date.now()/600000)*600;
await seedStore.put([{kind:'transition',receivedAt:Date.now(),source:'selection',context:hash(defaultViews),time:(end-86400)*1000,data:{main:'rainviewer',overview:'rainbow'}}]);
if(recording)await seedStore.setRetention(365);
for(let i=0;i<=144;i++)for(const [view,key] of [[defaultViews.view,defaultViews.viewKey],[defaultViews.overviewView,hash({source:'rainbow',originalKey:defaultViews.overviewKey})]]) {
  // Scale motion to each viewport so the smaller Overview always shows rain too.
  const x=view.width*(.5+Math.sin(i/10)*.3),y=view.height*(.5+Math.sin(i/8)*.2);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}"><g opacity=".8"><ellipse cx="${x}" cy="${y}" rx="${view.width*.16}" ry="${view.height*.18}" fill="#55b6bb"/><ellipse cx="${x-25}" cy="${y-10}" rx="${view.width*.08}" ry="${view.height*.09}" fill="#388ac7"/><ellipse cx="${x-35}" cy="${y-18}" rx="${view.width*.035}" ry="${view.height*.04}" fill="#6760ab"/></g></svg>`;
  const role=view===defaultViews.view?'main':'overview';
  await seedStore.publish({kind:'radar',receivedAt:Date.now(),context:hash(defaultViews),source:role==='main'?'rainviewer':'rainbow',role,time:(end-(144-i)*600)*1000,data:{}},await sharp(Buffer.from(svg)).png().toBuffer());
}
for(let i=-20;i<=144;i++){
  const time=end-(144-i)*600,center=30+24*Math.sin(i*.17),strength=Math.max(0,Math.sin(i*.085)+.3)*4;
  const forecast=i>0&&i%37===19?null:Array.from({length:61},(_,m)=>({time:time+m*60,precipitation:Math.round(Math.max(0,strength*Math.exp(-(((m-center)/13)**2))-.13)*10)/10})).filter((_,m)=>!(i%11===4&&m>=22&&m<30));
  const current={time,temperature:14+Math.sin(i/12)*4,feelsLike:12+Math.sin(i/12)*4,windMph:9+Math.sin(i/8)*5,humidity:Math.round(70+Math.sin(i/10)*12),windDirection:(i*5)%360,pressure:1012+Math.sin(i/15)*5,gustMph:15,dewPoint:8,visibility:10000,uvi:2};
  await saveWeatherHistory(seedStore,{context:weatherContext(defaultSettings),current,forecast,receivedAt:time*1000+90000});
}
if(cloudSeed){
 const manifest=JSON.parse(await readFile(join(cloudSeed,'manifest.json')));
 if(hash(makeViews(manifest.settings))!==hash(defaultViews))throw Error('Cloud seed geometry does not match fixture');
 for(const frame of manifest.frames)if(frame.url)await seedStore.publish({kind:'cloud',source:'rainbow',context:hash(defaultViews),role:'main',time:frame.time*1000,receivedAt:Date.now(),data:{}},await readFile(join(cloudSeed,'media',frame.url.split('/').at(-1))));
 try{await readFile(join(directory,'settings/clouds.json'));}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(join(directory,'settings/clouds.json'),JSON.stringify({enabled:true,map:'both'}));}
}
await seedStore.close();
// Optional local fixture settings carry-over; never use a production data folder.
if(process.env.RADAR_DEV_SETTINGS_FROM){
  const previous=process.env.RADAR_DEV_SETTINGS_FROM;
  for(const relative of ['settings','camera-fixture/settings','weather-fixture/policy.json']){
    await mkdir(join(directory,relative,'..'),{recursive:true});
    await cp(join(previous,relative),join(directory,relative),{recursive:true});
  }
}
const reservation=net();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
const internalPort=reservation.address().port;await new Promise(r=>reservation.close(r));
const origin=`http://127.0.0.1:${internalPort}`;
const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,DATA_DIR:directory,PORT:String(internalPort),BIND_ADDRESS:'127.0.0.1',RADAR_MANUAL_REFRESH:'1',...(trial?{RADAR_DEV_CLOUDS:'1',RADAR_DEV_CLOUD_USAGE:trial,RAINBOW_TEST_REQUEST_LIMIT:'500'}:{})},windowsHide:true,stdio:[trial?'pipe':'ignore','pipe','pipe']});
child.stderr.on('data',data=>process.stderr.write(data));
if(trial){
 try{let buffer=(await promisify(execFile)('ssh',['-o','BatchMode=yes','pi-weather','sudo cat /var/lib/docker/volumes/pi-rain-radar_radar-data/_data/settings/rainbow.json'],{encoding:'buffer',maxBuffer:4096,timeout:20000,windowsHide:true})).stdout;
 let key=JSON.parse(buffer.toString()).apiKey;buffer.fill(0);buffer=null;child.stdin.end(JSON.stringify({rainbowKey:key}));key='';
 }catch{child.kill();throw Error('Could not provide the runtime Rainbow credential.');}
}
await new Promise((resolve,reject)=>{child.stdout.on('data',data=>{if(String(data).includes('listening on port'))resolve();});child.once('exit',()=>reject(Error('Fixture backend exited')));});
const scenarios=scenarioCatalog.map(s=>s.id);
let scenario=recording?'forecast-recorded':process.argv.includes('--availability')?'availability-healthy':'healthy',revision=1;
const devCamera=await createDevCamera(directory,()=>scenario,origin,end*1000);
const devWeather=await createDevWeather(directory);
const scenarioLog=createDiagnostics(),observeScenario=createHealthEvents(scenarioLog.record);
scenarioLog.record('startup');
let demoKey=!!trial,demoRadar={waitForSettle:false,main:'rainviewer',overview:'same',monthlyLimit:null};
const controls=()=>controlsPage(scenario);
function filterWindow(data) {
  if(scenario==='archive-rollover'&&data.weatherHistory)data={...data,weatherHistory:{...data.weatherHistory,weather:data.weatherHistory.weather.filter(r=>r.time>=end-21600),forecasts:data.weatherHistory.forecasts.filter(r=>r.time>=end-21600)}};
  if(scenario==='archive-rollover'&&Array.isArray(data.times))data={...data,times:data.times.filter(t=>t>=end-21600),oldest:Math.max(data.oldest??0,(end-21600)*1000)};
  if(!Array.isArray(data.frames))return data;
  // Production frames are immutable; regenerated fixtures must not reuse their browser cache.
  const imageUrl=url=>url?`${url}?simulation=${simulationId}`:url;
  let frames=data.frames.map(f=>({...f,url:imageUrl(f.url),overviewUrl:imageUrl(f.overviewUrl)}));
  if(scenario==='archive-rollover')frames=frames.filter(f=>f.time>=end-21600);
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
  const statsCases=['gap-grace','late-recovered','gap-outstanding'];
  const incidents=role=>{
    const tracked=statsCases.includes(scenario)?coverage:[];
    const includes=time=>tracked.some(c=>c.time===time);
    const main=role==='main',late=scenario==='late-recovered';
    return {total:coverage.length,tracked:tracked.length,
      gapsSeen:main?(late?Number(includes(end-1200))+Number(scenario==='late-recovered'&&includes(end-2400)):0):Number(statsCases.includes(scenario)&&includes(end-1800)),
      lateArrivals:Number(main&&late&&includes(end-1200))};
  };
  return {...data,frames,frame:frames.at(-1)??null,coverage,playable:frames.length,complete:coverage.every(c=>c.pending||(c.main&&c.overview)),counts:Object.fromEntries(['main','overview'].map(role=>[role,{...incidents(role),available:coverage.filter(c=>c[role]).length,missing:coverage.filter(c=>!c[role]&&!c.pending).length}]))};
}
const server=http(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://127.0.0.1:3091');
    if(trial&&req.method==='POST'&&path.pathname.startsWith('/api/settings/')&&(req.headers['content-type']!=='application/json'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host||req.headers['sec-fetch-site']==='cross-site')){res.writeHead(403);return res.end('{}');}
    if(scenario==='archive-rollover'&&path.pathname.startsWith('/archive/media/')&&Number(path.pathname.split('/').at(-1).split('-')[0])<(end-21600)*1000){res.writeHead(404,{'Cache-Control':'no-store'});return res.end('Synthetic rolled image');}
    const controlAssets={'/__archive-weather':['dev-archive-weather.html','text/html'],'/__archive-weather.js':['dev-archive-weather.js','text/javascript'],'/__archive-weather.css':['dev-archive-weather.css','text/css'],'/__dev/style.css':['dev-controls.css','text/css'],'/__dev/controls.js':['dev-controls.js','text/javascript']};
    if(controlAssets[path.pathname]) {const [file,type]=controlAssets[path.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(await readFile(new URL(file,import.meta.url)));}
    if(path.pathname==='/__dev'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(controls());}
    if(path.pathname==='/__embed'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end('<!doctype html><html><head><title>Embed review · synthetic radar</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#142623;color:#e1eee7;font:16px system-ui"><h1>Embed review · synthetic radar</h1><p>Change scenarios in the studio; both cards follow. Only Main radar affects their LEDs.</p><iframe title="Small embed" src="/embed" width="320" height="180"></iframe><iframe title="Tall embed" src="/embed" width="240" height="360"></iframe><p><a style="color:inherit" href="/__dev">Scenario studio</a></p></body></html>');}
    if(path.pathname==='/__scenario'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      const next=new URLSearchParams(body).get('scenario');
      if(!scenarios.includes(next)){res.writeHead(400);return res.end('Unknown scenario');}
      if(next==='forecast-recorded'&&!recording){res.writeHead(409);return res.end('Restart with --forecast-recording and a local export.');}
      if(next!==scenario && ['weather-first','weather-second'].includes(next))scenarioLog.record('weather-error');
      await devWeather.scenario(next);
      scenario=next;
      if(next==='rc2-review'||next.startsWith('camera-')){await devCamera.ready();await devCamera.camera.configure({enabled:true});}
      if(next==='radar-disabled')demoRadar={...demoRadar,main:'disabled',overview:'same'};
      else if(next==='radar-overview-only')demoRadar={...demoRadar,main:'disabled',overview:'rainviewer'};
      else if(next==='healthy')demoRadar={...demoRadar,main:'rainviewer',overview:'same'};
      scenario=next;revision++;
      if(req.headers.accept==='application/json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({scenario,revision}));}
      res.writeHead(303,{Location:'/__dev'});return res.end();
    }
    // Keep the out-of-band console usable while the entire application backend is offline.
    if(scenario==='unreachable' && (path.pathname.startsWith('/api/') || path.pathname==='/healthz')) {
      res.writeHead(503,{'Content-Type':'text/plain','Cache-Control':'no-store'});
      return res.end('Synthetic backend unavailable');
    }
    if(path.pathname.startsWith('/__dev/availability/')){
      const match=path.pathname.match(/^\/__dev\/availability\/(rain-main|rain-overview|cloud-main|cloud-overview|camera)\/(\d+)\.svg$/);
      if(!match){res.writeHead(404);return res.end();}
      if(path.searchParams.get('case')==='availability-slow')await new Promise(r=>setTimeout(r,700));
      res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});return res.end(syntheticMedia(match[1],Number(match[2])));
    }
    if(scenario.startsWith('availability-')&&path.pathname==='/api/camera'){
      const data=syntheticAvailability({frames:[],start:end-Number(path.searchParams.get('hours')??2)*3600,end},{scenario});
      const records=data.cameraHistory.records;
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({...data.cameraHistory,latest:data.camera.enabled?{...records.at(-1),time:Date.now(),asset:'/__dev/availability/camera/'+Math.floor(Date.now()/1000)+'.svg?case='+scenario}:null,status:data.camera}));
    }
    const send=data=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(['/api/settings/weather','/api/settings/weather/initialize','/api/settings/home-assistant','/api/settings/home-assistant/entities','/api/settings/openweather'].includes(path.pathname)){
      if(!path.pathname.endsWith('/initialize')){const check=await fetch(origin+'/api/settings',{headers:req.headers.authorization?{Authorization:req.headers.authorization}:{}});if(!check.ok){res.writeHead(check.status);return res.end('{}');}}
      let input;if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>8192){res.writeHead(413);return res.end('{}');}}input=JSON.parse(body);}
      const result=await devWeather.configure(path.pathname,input);
      if(input&&path.pathname==='/api/settings/weather'&&result.status===200)demoRadar=disableRadarProviders(demoRadar,source=>result[source+'Collect']);
      res.writeHead(result.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(result));
    }
    if(path.pathname==='/api/settings/camera'||path.pathname.startsWith('/api/settings/camera/'))return await devCamera.handle(req,res,path.pathname);
    if(path.pathname==='/api/camera/image'){const bytes=devCamera.camera.image(path.searchParams.get('source'),path.searchParams.get('capture'));res.writeHead(bytes?200:404,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});return res.end(bytes??'Not found');}
    if(path.pathname==='/api/camera')return send(await devCamera.camera.live(Number(path.searchParams.get('hours')??2),path.searchParams.has('end')?Number(path.searchParams.get('end'))*1000:undefined));
    if(/^\/archive\/media\/[a-f0-9-]+\/\d+\/\d+-[a-f0-9-]+\.(png|jpg|webp)$/.test(path.pathname)){
      // Only generated camera assets use the fixture's separate managed store.
      // Serve by immutable path, independent of the current history window.
      try{const bytes=await readFile(join(directory,'camera-fixture',path.pathname));res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable'});return res.end(bytes);}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(path.pathname==='/api/settings/rainbow'&&!trial) {
      if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const hadKey=demoKey;demoKey=!!JSON.parse(body).apiKey;if(!hadKey||!demoKey){await devWeather.configure('/weather',{rainbowCollect:false});demoRadar=disableRadarProviders(demoRadar,source=>source!=='rainbow');}}
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
      let body='';for await(const chunk of req)body+=chunk;const next=JSON.parse(body),policy=await devWeather.configure('/weather');
      if(!['disabled','rainviewer','rainbow'].includes(next.main)||!['same','disabled','rainviewer','rainbow'].includes(next.overview)){res.writeHead(400);return res.end('{}');}
      const enabled=source=>source==='disabled'||policy[source+'Collect']&&(source!=='rainbow'||demoKey);
      if(!enabled(next.main)||!enabled(next.overview==='same'?next.main:next.overview)){res.writeHead(400);return res.end(JSON.stringify({error:'Enable the selected provider first.'}));}
      demoRadar={...demoRadar,...next};return send({status:200});
    }
    if((trial&&['/api/settings/clouds','/api/settings/rainbow'].includes(path.pathname)||['/api/settings/unlock','/api/settings/lock','/api/settings/activity','/api/settings/pin','/api/settings/embed','/api/settings/storage'].includes(path.pathname))&&req.method==='POST') {
      let body='';for await(const chunk of req)body+=chunk;
      const response=await fetch(origin+req.url,{method:'POST',headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},body});
      res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(await response.text());
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(403);return res.end('Playback fixture is read-only');}
    const response=await fetch(origin+req.url,{method:req.method,headers:req.headers.authorization?{Authorization:req.headers.authorization}:{}});
    if(path.pathname==='/api/settings/diagnostics'&&response.ok) return send(scenarioLog.snapshot());
    if(path.pathname==='/api/settings'&&response.ok){const data=await response.json();return send({...data,radar:demoRadar});}
    if(path.pathname==='/api/status'||path.pathname==='/api/archive'){
      let data=filterWindow(await response.json());
      if(path.pathname==='/api/status'){
        data.camera=devCamera.camera.status();
        data.cameraHistory=await devCamera.camera.live(Number(path.searchParams.get('hours')??2),data.end*1000);
        if(scenario==='archive-rollover'&&data.storage)data.storage={...data.storage,pressure:true,oldest:(end-21600)*1000};
        data.archiveRevision=`fixture-${revision}-${data.archiveRevision}`;
        if(data.sources)for(const source of Object.values(data.sources)){source.time=Math.floor(Date.now()/600000)*600;source.checkedAt=new Date(end*1000).toISOString();source.nextCheckAt=Math.ceil(Date.now()/300000)*300000;source.state=scenario==='source-error'?'warning':'ready';source.error=scenario==='source-error'?'Synthetic provider unavailable':null;}
      }
      if(path.pathname==='/api/archive'&&path.searchParams.has('end'))data.cameraHistory=await devCamera.history(Number(path.searchParams.get('end'))*1000,Number(path.searchParams.get('hours')??2));
      if(path.pathname==='/api/status') {
        const now=Date.now(),minute=Math.floor(now/60000)*60;
        data.weather={configured:true,fetchedAt:now,forecastFetchedAt:now,failures:0,data:{current:{time:minute,temperature:14,feelsLike:12,windMph:scenario==='rc2-review'?27:9,gustMph:null,humidity:72,windDirection:245,dewPoint:8,visibility:10000,pressure:1012,uvi:2},minutely:Array.from({length:60},(_,i)=>({time:minute+i*60,precipitation:i>15&&i<35?1:0}))}};
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
        Object.assign(data,devWeather.status(data.weather,scenario));
        const cloudFrames=data.frames;Object.assign(data,maskLiveRadar(data,demoRadar));
        if(trial&&data.clouds?.enabled){data.frames=cloudFrames.map(f=>({...f,url:demoRadar.main==='disabled'?null:f.url,overviewUrl:(demoRadar.overview==='disabled'||demoRadar.overview==='same'&&demoRadar.main==='disabled')?null:f.overviewUrl}));data.radarDisabled=false;data.playable=data.frames.length;}
        for(const role of ['main','overview']){const source=demoRadar[role]==='same'?demoRadar.main:demoRadar[role];data.sources[role]={...data.sources[role],source,enabled:source!=='disabled',...(source==='disabled'?{state:'disabled',error:null,time:null,fetching:false}:{})};}
        observeScenario(data.sources,data.weather);
      }
      if(scenario.startsWith('availability-'))data=syntheticAvailability(data,{scenario,archive:path.pathname==='/api/archive'});
      if(scenario==='rc2-review'||scenario==='weather-trends'||scenario.startsWith('camera-')){
        const {weatherPolicy,camera,cameraHistory}=data;
        data={...syntheticAvailability(data,{scenario:'availability-healthy',archive:path.pathname==='/api/archive'}),weatherPolicy,camera,cameraHistory};
      }
      if(scenario==='weather-trends')data=trendFixture(data);
      if(scenario==='forecast-recorded'&&recording)data=applyForecastRecording(data,recording);
      res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(data));
    }
    const headers=Object.fromEntries(response.headers);delete headers['content-encoding'];delete headers['transfer-encoding'];
    let body=Buffer.from(await response.arrayBuffer());if((recording||trial||process.argv.includes('--availability'))&&path.pathname==='/')body=Buffer.from(body.toString().replace('</body>',`<div class="cloud-poc-banner">${recording?(scenario==='forecast-recorded'?'DEV · Recorded OWM Archive forecasts · Radar / camera / Live weather synthetic · No provider calls':'DEV · All data synthetic · No provider calls'):trial?'DEV · Synthetic rain · Real Rainbow clouds · 500-request trial':'DEV · All data synthetic · No provider calls'}</div></body>`));headers['content-length']=body.length;
    res.writeHead(response.status,headers);res.end(body);
  }catch{res.writeHead(502);res.end('Synthetic backend unavailable');}
});
server.listen(3091,'127.0.0.1',()=>console.log(JSON.stringify({preview:'http://127.0.0.1:3091',controls:'http://127.0.0.1:3091/__dev',directory,backendPid:child.pid,pid:process.pid})));
server.on('error',error=>{console.error(error.message);child.kill();process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.kill();server.close(async()=>{await devCamera.close();await devWeather.close();process.exit(0);});});
