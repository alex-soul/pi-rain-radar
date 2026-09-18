import { localRainbowCounts } from "./stats.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createWeather } from './weather.js';
import { createDiagnostics } from './diagnostics.js';
import { createRadarSettings } from './radar-settings.js';
import { createRainbow } from './rainbow.js';
import { createDevicePower } from './device-power.js';
import { validArchiveHours } from './observation-archive.js';
import { createRadarSources } from './radar-sources.js';
import * as rainviewer from './provider.js';
import { createMapSettings } from './map-settings.js';
import { mapPage } from './map-page.js';
import { assetNames } from './map-assets.js';
import packageInfo from '../package.json' with {type:'json'};

import { createSettingsAuth, settingsRoutes } from "./settings-auth.js";

const directory = process.env.DATA_DIR || "/data";
let nextRefreshAt = process.env.RADAR_MANUAL_REFRESH === '1' ? null : Date.now() + 300000;
let weather;
const diagnostics = createDiagnostics();
diagnostics.record('startup');
const radarSettings = await createRadarSettings(directory, { onEvent: diagnostics.record });
const rainbow=await createRainbow(directory,{monthlyLimit:radarSettings.requestLimit,
  testRequestLimit:process.env.RAINBOW_TEST_REQUEST_LIMIT?Number(process.env.RAINBOW_TEST_REQUEST_LIMIT):null,
  inUse:()=>{const s=radarSettings.current();return s.main==='rainbow'||s.overview==='rainbow'||maps.current().radar.status().fetching;},onEvent:diagnostics.record});
const maps = await createMapSettings(directory,{radarFactory:(directory,_,options)=>createRadarSources(directory,{rainviewer,rainbow},{...options,historyDepth:process.env.RADAR_TEST_HISTORY==='2'?2:13,selection:radarSettings.current}),nextRefreshAt:()=>nextRefreshAt,waitForSettle:radarSettings.waitForSettle,onEvent:diagnostics.record,onChange:settings=>weather.setLocation(settings)});
radarSettings.setApply((next,commit)=>{
  if(maps.status().busy)return {status:409,error:'Wait for the map update to finish.'};
  if((next.main==='rainbow'||next.overview==='rainbow')&&!rainbow.configured())return {status:400,error:'Save a Rainbow key before selecting it.'};
  return maps.current().radar.configure(next,commit);
});
weather = await createWeather(directory,{location:maps.current().settings,onEvent:diagnostics.record});
const power=createDevicePower({onEvent:diagnostics.record});
const handleSettings = settingsRoutes(createSettingsAuth(directory), weather, maps, { diagnostics, radarSettings, rainbow, power });
const staticFiles = new Map([
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
  ["/frame-loader.js", ["frame-loader.js", "text/javascript"]],
  ["/pin-entry.js", ["pin-entry.js", "text/javascript"]],
  ["/weather.js", ["weather.js", "text/javascript"]],
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
    if (path === "/api/archive") {
      const params = new URL(req.url, "http://localhost").searchParams;
      if (params.get('map') && params.get('map') !== active.id) { res.writeHead(409); return res.end(); }
      const end = params.get('end');
      const hours = params.get('hours') ?? '2';
      const result = !/^([1-9]|1[0-9]|2[0-4])$/.test(hours) || !validArchiveHours(Number(hours)) ? null : end === null ? radar.archive.available() : /^\d+$/.test(end) ? radar.archive.window(Number(end), Number(hours)) : null;
      res.writeHead(result ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(result || { error: 'That history is unavailable' }));
    }
    if (path === "/api/status" || path === "/healthz") {
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
            : { ...radar.status(Number(hours)), archiveRevision:radar.archive.revision(), appVersion:packageInfo.version, weather: weather.status(), stats: {rainbow:localRainbowCounts(rainbow.status().usage)}, mapId:active.id, mapUpdate:maps.status() },
        ),
      );
    }
    let file,
      type,
      cache = "no-cache";
    if (/^\/frames\/\d+-[a-f0-9]{12}\.png$/.test(path)) {
      file = join(directory, path.split("/").at(-1));
      type = "image/png";
      cache = "public, max-age=31536000, immutable";
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
const timer = process.env.RADAR_MANUAL_REFRESH==='1'?null:setInterval(scheduledRefresh, 300000);
function stop() {
  clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
