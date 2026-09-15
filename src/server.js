import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createWeather } from './weather.js';
import { createMapSettings } from './map-settings.js';
import { mapPage } from './map-page.js';
import { assetNames } from './map-assets.js';
import packageInfo from '../package.json' with {type:'json'};

import { createSettingsAuth, settingsRoutes } from "./settings-auth.js";

const directory = process.env.DATA_DIR || "/data";
let nextRefreshAt = Date.now() + 300000;
let weather;
const maps = await createMapSettings(directory,{nextRefreshAt:()=>nextRefreshAt,onChange:settings=>weather.setLocation(settings)});
weather = await createWeather(directory,{location:maps.current().settings});
const handleSettings = settingsRoutes(createSettingsAuth(directory), weather, maps);
const staticFiles = new Map([
  ["/", ["index.html", "text/html"]],
    ["/control-layout.js", ["control-layout.js", "text/javascript"]],
    ["/display.js", ["display.js", "text/javascript"]],
  ["/settings.js", ["settings.js", "text/javascript"]],
  ["/pin-entry.js", ["pin-entry.js", "text/javascript"]],
  ["/weather.js", ["weather.js", "text/javascript"]],
  ["/time.js", ["time.js", "text/javascript"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/theme.js", ["theme.js", "text/javascript"]],
  ["/overview.js", ["overview.js", "text/javascript"]],
  ["/minutecast.js", ["minutecast.js", "text/javascript"]],
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
      const result = end === null ? radar.archive.available() : /^\d+$/.test(end) ? radar.archive.window(Number(end)) : null;
      res.writeHead(result ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(result || { error: 'That history is unavailable' }));
    }
    if (path === "/api/status" || path === "/healthz") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify(
          path === "/healthz"
            ? { ok: true, hasFrame: !!radar.status().frame }
            : { ...radar.status(), appVersion:packageInfo.version, weather: weather.status(), mapId:active.id, mapUpdate:maps.status() },
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
server.listen(3000, "0.0.0.0", () =>
  console.log("Pi Rain Radar listening on port 3000"),
);
function scheduledRefresh() {
  const startedAt = Date.now();
  nextRefreshAt = startedAt + 300000;
  if (!maps.status().busy) void maps.current().radar.refresh(startedAt);
  void weather.refresh();
}
scheduledRefresh();
const timer = setInterval(scheduledRefresh, 300000);
function stop() {
  clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
