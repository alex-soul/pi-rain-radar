import {loadWeatherHistory} from './weather-history.js';
import {createHomeAssistant} from './home-assistant.js';
import {createWeatherSettings} from './weather-settings.js';
import {createHaWeather} from './ha-weather.js';
import {createHistoryStore} from './history-store.js';
import {createStorageStatus} from './storage-status.js';
import {createCamera,cameraHistory} from './camera.js';
import { createHealthEvents } from './health-events.js';
import { createReleaseCheck } from './release-check.js';
import { createEmbedSettings } from './embed-settings.js';
import { localRainbowCounts } from "./stats.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createWeather } from './weather.js';
import { createDiagnostics } from './diagnostics.js';
import { createRadarSettings } from './radar-settings.js';
import { createRainbow } from './rainbow.js';
import { createDevicePower } from './device-power.js';
import { validArchiveHours } from './radar-history.js';
import { createRadarSources } from './radar-sources.js';
import * as rainviewer from './provider.js';
import { createMapSettings } from './map-settings.js';
import { mapPage } from './map-page.js';
import { assetNames } from './map-assets.js';
import packageInfo from '../package.json' with {type:'json'};

import { createSettingsAuth, settingsRoutes } from "./settings-auth.js";

const directory = process.env.DATA_DIR || "/data";
let nextRefreshAt = process.env.RADAR_MANUAL_REFRESH === '1' ? null : Date.now() + 300000;
let weather,haWeather;
const diagnostics = createDiagnostics();
diagnostics.record('startup');
const history = await createHistoryStore(directory);
const storage = createStorageStatus(history,directory);
const existingKey=async name=>{try{return !!JSON.parse(await readFile(join(directory,'settings',name+'.json'),'utf8')).apiKey;}catch{return false;}};
const weatherSettings=await createWeatherSettings(history,{settingsFile:join(directory,'settings','weather.json'),owmEnabled:await existingKey('openweather'),rainbowEnabled:await existingKey('rainbow'),onChange:async()=>{weather?.collectionChanged();await haWeather?.changed();}});
const collectionEnabled=source=>weatherSettings.current()[source+'Collect'];
const ha=await createHomeAssistant(directory,{autoStart:process.env.RADAR_MANUAL_REFRESH!=='1',onChange:async()=>{if(!ha.status().configured)await weatherSettings.configure({haCollect:false});await haWeather?.changed();}});
const radarSettings = await createRadarSettings(directory, { onEvent: diagnostics.record });
const rainbow=await createRainbow(directory,{monthlyLimit:radarSettings.requestLimit,
  enabled:()=>collectionEnabled('rainbow'),
  onNewKey:async()=>{const result=await weatherSettings.configure({rainbowCollect:false});if(result.status!==200)throw Error('Could not update collection policy');},
  testRequestLimit:process.env.RAINBOW_TEST_REQUEST_LIMIT?Number(process.env.RAINBOW_TEST_REQUEST_LIMIT):null,
  inUse:()=>{const s=radarSettings.current();return collectionEnabled('rainbow')&&(s.main==='rainbow'||s.overview==='rainbow')||maps.current().radar.status().fetching;},onEvent:diagnostics.record});
const rainviewerProvider={getHistory:()=>rainviewer.getHistory({enabled:()=>collectionEnabled('rainviewer')}),getTile:(frame,tile)=>rainviewer.getTile(frame,tile,{enabled:()=>collectionEnabled('rainviewer')})};
const maps = await createMapSettings(directory,{radarFactory:(directory,_,options)=>createRadarSources(directory,{rainviewer:rainviewerProvider,rainbow},{...options,store:history,enabled:collectionEnabled,historyDepth:process.env.RADAR_TEST_HISTORY==='2'?2:13,selection:radarSettings.current}),nextRefreshAt:()=>nextRefreshAt,waitForSettle:radarSettings.waitForSettle,onEvent:diagnostics.record,onChange:settings=>weather.setLocation(settings),protectRadar:radars=>history.protect(radars.map(radar=>radar.protection()))});
radarSettings.setApply((next,commit)=>{
  if(maps.status().busy)return {status:409,error:'Wait for the map update to finish.'};
  if((next.main==='rainbow'||next.overview==='rainbow')&&!rainbow.configured())return {status:400,error:'Save a Rainbow key before selecting it.'};
  return maps.current().radar.configure(next,commit);
});
weather = await createWeather(directory,{store:history,location:maps.current().settings,onEvent:diagnostics.record,enabled:()=>weatherSettings.current().owmCollect,onNewKey:async()=>{const result=await weatherSettings.configure({owmCollect:false});if(result.status!==200)throw Error('Could not update collection policy');},onData:async()=>{await haWeather?.record();}});
haWeather=await createHaWeather({ha,settings:weatherSettings,weather,store:history,location:()=>maps.current().settings,autoStart:process.env.RADAR_MANUAL_REFRESH!=='1',onEvent:diagnostics.record});
const power=createDevicePower({onEvent:diagnostics.record});
const embed=await createEmbedSettings(directory);
const releases=await createReleaseCheck(directory,packageInfo.version);
const camera=await createCamera(directory,{store:history,ha,onEvent:diagnostics.record});
const handleSettings = settingsRoutes(createSettingsAuth(directory), weather, maps, { diagnostics, radarSettings, rainbow, power, embed, storage, camera, ha, weatherSettings });
const observeHealth=createHealthEvents(diagnostics.record);
const checkHealth=()=>observeHealth(maps.current().radar.healthSources(),weather.status());
let maintaining=false,nextMaintenance=0;
async function maintainHistory(){
  if(maintaining||Date.now()<nextMaintenance)return;maintaining=true;
  try{
    const radar=maps.current().radar;
    // Transition owners hold both old and candidate contexts until commit or
    // failure. Never replace that protection with a stale active-only sample.
    if(!maps.status().busy&&!radar.status().fetching)await history.protect([radar.protection()]);
    const result=await history.maintain();await radar.observe();await storage.refresh();
    nextMaintenance=Date.now()+((result.recordsRemoved>=128||result.cleanupPending||result.recoveryPending||(storage.status()?.legacyPending))?1000:30000);
  }
  catch{nextMaintenance=Date.now()+30000;diagnostics.record('storage-error');}finally{maintaining=false;}
}
await maintainHistory();
const storageTimer=setInterval(()=>void maintainHistory(),1000);
const healthTimer=setInterval(()=>{checkHealth();void maps.current().radar.observe();},15000);
const staticFiles = new Map([
  ['/weather-policy.js',['weather-policy.js','text/javascript']],
  ['/settings-layout.js',['settings-layout.js','text/javascript']],
  ['/settings-layout-details.js',['settings-layout-details.js','text/javascript']],
  ['/integration-onboarding.js',['integration-onboarding.js','text/javascript']],
  ['/integrations-state.js',['integrations-state.js','text/javascript']],
  ['/integrations.css',['integrations.css','text/css']],

  ['/camera-widget.js',['camera-widget.js','text/javascript']],
  ['/camera-model.js',['camera-model.js','text/javascript']],
  ['/attribution.js',['attribution.js','text/javascript']],
  ['/camera-settings-ui.js',['camera-settings-ui.js','text/javascript']],
  ['/archive-calendar.js',['archive-calendar.js','text/javascript']],
  ['/storage-ui.js',['storage-ui.js','text/javascript']],
  ['/history-weather-model.js',['history-weather-model.js','text/javascript']],
  ['/history-weather-ui.js',['history-weather-ui.js','text/javascript']],
  ['/release-ui.js',['release-ui.js','text/javascript']],
  ['/embed.js',['embed.js','text/javascript']],
  ['/embed.css',['embed.css','text/css']],
  ['/embed-settings-ui.js',['embed-settings-ui.js','text/javascript']],
  ['/connection-events.js',['connection-events.js','text/javascript']],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/icon.svg", ["icon.svg", "image/svg+xml"]],
  ["/icon-192.png", ["icon-192.png", "image/png"]],
  ["/icon-512.png", ["icon-512.png", "image/png"]],
  ["/icon-maskable-512.png", ["icon-maskable-512.png", "image/png"]],
  ["/you-rock.png", ["you-rock.png", "image/png"]],
  ["/", ["index.html", "text/html"]],
    ["/control-layout.js", ["control-layout.js", "text/javascript"]],
    ["/display.js", ["display.js", "text/javascript"]],
  ["/settings.js", ["settings.js", "text/javascript"]],
  ["/radar-settings-ui.js", ["radar-settings-ui.js", "text/javascript"]],
  ["/device-power.js", ["device-power.js", "text/javascript"]],
  ["/diagnostics.js", ["diagnostics.js", "text/javascript"]],
  ["/playback.js", ["playback.js", "text/javascript"]],
  ["/live-window.js", ["live-window.js", "text/javascript"]],
  ["/frame-loader.js", ["frame-loader.js", "text/javascript"]],
  ["/pin-entry.js", ["pin-entry.js", "text/javascript"]],
  ["/weather.js", ["weather.js", "text/javascript"]],
  ["/health.js", ["health.js", "text/javascript"]],
  ["/weather-format.js", ["weather-format.js", "text/javascript"]],
  ["/screen-lock.js", ["screen-lock.js", "text/javascript"]],
  ["/settings-idle.js", ["settings-idle.js", "text/javascript"]],
  ["/pin-idle.js", ["pin-idle.js", "text/javascript"]],
  ["/settings-help.js", ["settings-help.js", "text/javascript"]],
  ["/time.js", ["time.js", "text/javascript"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/theme.js", ["theme.js", "text/javascript"]],
  ["/preference-upgrade.js", ["preference-upgrade.js", "text/javascript"]],
  ["/overview.js", ["overview.js", "text/javascript"]],
  ["/stats.js", ["stats.js", "text/javascript"]],
  ["/stats-format.js", ["stats-format.js", "text/javascript"]],
  ["/floating-widget.js", ["floating-widget.js", "text/javascript"]],
  ["/rain-forecast.js", ["rain-forecast.js", "text/javascript"]],
  ["/overview.svg", ["overview.svg", "image/svg+xml"]],
  ["/overview-dark.svg", ["overview-dark.svg", "image/svg+xml"]],
  ["/styles.css", ["styles.css", "text/css"]],
  ["/basemap.svg", ["basemap.svg", "image/svg+xml"]],
  ["/basemap-dark.svg", ["basemap-dark.svg", "image/svg+xml"]],
  ["/places.json", ["places.json", "application/json"]],
]);
const server = createServer(async (req, res) => {
  try {
    const settingsPath = new URL(req.url, "http://localhost").pathname;
    if (settingsPath === "/api/settings" || settingsPath.startsWith("/api/settings/")) {
      checkHealth();
      return await handleSettings(req, res, settingsPath);
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      return res.end();
    }
    const path = new URL(req.url, "http://localhost").pathname;
    const active = maps.current();
    const radar = active.radar;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'",
    );
    if (path === '/embed') {
      const config=embed.current();
      if(!config.enabled||!config.origins.length){res.writeHead(404,{'Cache-Control':'no-store'});return res.end('Embedding is disabled.');}
      res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors ${config.origins.join(' ')}`);
      const template=(await readFile('public/embed.html','utf8')).replace('{{EMBED_THEME}}',config.theme).replace('{{EMBED_HOURS}}',String(config.hours)).replace('{{EMBED_SPEED}}',String(config.speed)).replace('{{EMBED_BASEMAP}}',config.theme==='dark'?'basemap-dark.svg':'basemap.svg');
      res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
      return res.end(req.method==='HEAD'?undefined:mapPage(template,active));
    }
    if (path === "/api/archive") {
      const params = new URL(req.url, "http://localhost").searchParams;
      if (params.get('map') && params.get('map') !== active.id) { res.writeHead(409); return res.end(); }
      const end = params.get('end');
      const hours = params.get('hours') ?? '2';
      const result = !/^([1-9]|1[0-9]|2[0-4])$/.test(hours) || !validArchiveHours(Number(hours)) ? null : end === null ? await radar.archive.available(params.has('start')?Number(params.get('start')):undefined,params.has('until')?Number(params.get('until')):undefined) : /^\d+$/.test(end) ? await radar.archive.window(Number(end), Number(hours)) : null;
      if(result&&end!==null){result.weatherHistory=await loadWeatherHistory(history,active.settings,Number(end),Number(hours));result.cameraHistory=await cameraHistory(history,Number(end)*1000,Number(hours));}
      res.writeHead(result ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(result || { error: 'That history is unavailable' }));
    }
    if(path==='/api/camera'){
      const hours=new URL(req.url,'http://localhost').searchParams.get('hours')??'2';
      if(!['2','4','6'].includes(hours)){res.writeHead(400);return res.end();}
      const end=new URL(req.url,'http://localhost').searchParams.get('end');
      if(end!==null&&(!/^\d+$/.test(end)||!Number.isSafeInteger(Number(end)*1000)||Number(end)*1000>Date.now())){res.writeHead(400);return res.end();}
      const result=await camera.live(Number(hours),end===null?undefined:Number(end)*1000);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:JSON.stringify(result));
    }
    if (path === '/api/releases') {
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(req.method==='HEAD'?undefined:JSON.stringify(releases.status()));
    }
    if (path === "/api/status" || path === "/healthz") {
      checkHealth();
      const hours = new URL(req.url, "http://localhost").searchParams.get('hours') ?? '2';
      if (!['2','4','6'].includes(hours)) { res.writeHead(400); return res.end(); }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify(
          path === "/healthz"
            ? { ok: true, hasFrame: !!radar.status().frame }
            : { ...radar.status(Number(hours)), archiveRevision:radar.archive.revision(), appVersion:packageInfo.version, storage:storage.status(), camera:camera.status(), homeAssistant:ha.status(), weatherPolicy:weatherSettings.current(), weather: {...weather.status(),presentation:haWeather.status()}, stats: {rainbow:localRainbowCounts(rainbow.status().usage)}, mapId:active.id, mapUpdate:maps.status() },
        ),
      );
    }
    let file,
      type,
      cache = "no-cache";
    if (/^\/archive\/media\/[a-f0-9-]+\/\d+\/\d+-[a-f0-9-]+\.(png|jpg|webp)$/.test(path)) {
      file=join(directory,...path.split('/').slice(1));type=path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':'image/jpeg';cache='public, max-age=31536000, immutable';
    } else if (/^\/maps\/[a-f0-9]{12}\/[a-z.-]+$/.test(path) && assetNames.includes(path.split('/').at(-1))) {
      file=join(directory,...path.split('/').slice(1));
      type=path.endsWith('.json')?'application/json':'image/svg+xml';
      cache='public, max-age=31536000, immutable';
    } else if (staticFiles.has(path)) {
      const item = staticFiles.get(path);
      file = join("public", item[0]);
      type = item[1];
    } else {
      res.writeHead(404);
      return res.end("Not found");
    }
    const body = path==='/' ? mapPage(await readFile(file,'utf8'),active) : await readFile(file);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const port=Number(process.env.PORT||3000);
server.listen(port, process.env.BIND_ADDRESS||"0.0.0.0", () =>
  console.log(`Pi Rain Radar listening on port ${port}`),
);
function scheduledRefresh() {
  const startedAt = Date.now();
  nextRefreshAt = startedAt + 300000;
  if (!maps.status().busy) void maps.current().radar.refresh(startedAt);
  void weather.refresh();
}
if(process.env.RADAR_MANUAL_REFRESH!=='1')scheduledRefresh();
// Synthetic/manual runs never contact GitHub. Status reads never trigger checks.
if(process.env.RADAR_MANUAL_REFRESH!=='1')void releases.check();
const releaseTimer=process.env.RADAR_MANUAL_REFRESH==='1'?null:setInterval(()=>void releases.check(),3600000);
const timer = process.env.RADAR_MANUAL_REFRESH==='1'?null:setInterval(scheduledRefresh, 300000);
function stop() {
  haWeather.close();ha.close();
  clearInterval(storageTimer);
  clearInterval(timer);
  clearInterval(releaseTimer);
  clearInterval(healthTimer);
  server.close(async () => {await camera.close();await history.close();process.exit(0);});
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
