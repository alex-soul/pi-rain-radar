import { createHash } from "node:crypto";

export const defaultSettings = Object.freeze({name:'Coventry',lat:52.40801,lon:-1.51041,zoom:8,overviewZoom:5,timeZone:'Europe/London'});
// Frozen compatibility baseline for installations created before map defaults were persisted.
export const legacyDefaultSettings = Object.freeze({name:'Coventry',lat:52.4081,lon:-1.5106,zoom:8,overviewZoom:4.939384107485931,timeZone:'Europe/London'});
// Cache identity must change with geography, not just the observation timestamp.
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,12);
// Presentation time zones do not change prepared map assets or radar geometry.
export const mapAssetId = ({timeZone,...settings}) => hash({version:1,settings});
export const defaultViews = makeViews(defaultSettings);
export const {view,viewKey,overviewView,overviewKey} = defaultViews;
export const overviewScale = 2 ** overviewView.zoom;

export function world(lon, lat, zoom) {
  const size = 256 * 2 ** zoom;
  const sin = Math.sin(
    (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180,
  );
  return [
    ((lon + 180) / 360) * size,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  ];
}

export function project(lon, lat, view = defaultViews.view) {
  const [cx, cy] = world(view.lon, view.lat, view.zoom);
  const [x, y] = world(lon, lat, view.zoom);
  return [x - cx + view.width / 2, y - cy + view.height / 2];
}

export function radarTiles(target = view) {
  const view = target;
  const scale = 2 ** (view.zoom - view.radarZoom);
  const [cx, cy] = world(view.lon, view.lat, view.radarZoom);
  const left = cx - view.width / (2 * scale);
  const top = cy - view.height / (2 * scale);
  const tiles = [];
  for (
    let y = Math.floor(top / 256);
    y <= Math.floor((top + view.height / scale - 0.001) / 256);
    y++
  ) {
    for (
      let x = Math.floor(left / 256);
      x <= Math.floor((left + view.width / scale - 0.001) / 256);
      x++
    ) {
      tiles.push({
        x: ((x % 2 ** view.radarZoom) + 2 ** view.radarZoom) % 2 ** view.radarZoom,
        y,
        zoom: view.radarZoom,
        left: Math.round((x * 256 - left) * scale),
        top: Math.round((y * 256 - top) * scale),
        size: Math.round((x * 256 - left + 256) * scale) - Math.round((x * 256 - left) * scale),
        tileHeight: Math.round((y * 256 - top + 256) * scale) - Math.round((y * 256 - top) * scale),
      });
    }
  }
  return tiles;
}

export function validateMapSettings(input) {
  if (!input || typeof input.name !== 'string' || input.name.trim().length > 60 || /[\x00-\x1f\x7f]/.test(input.name)) throw new Error('Use up to 60 characters for the location name.');
  for (const [field, min, max] of [['lat',-80,80],['lon',-180,180],['zoom',6,10],['overviewZoom',2,7]]) {
    if (typeof input[field] !== 'number' || !Number.isFinite(input[field]) || input[field] < min || input[field] > max) throw new Error(`${field}: enter a number from ${min} to ${max}.`);
  }
  if (input.overviewZoom > input.zoom) throw new Error('Overview zoom must not exceed main map zoom.');
  let timeZone = input.timeZone === undefined ? defaultSettings.timeZone : input.timeZone;
  if (typeof timeZone !== 'string' || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timeZone) || timeZone.length > 80) throw new Error('Choose a valid time zone, such as Europe/London.');
  try { timeZone = new Intl.DateTimeFormat('en-GB',{timeZone}).resolvedOptions().timeZone; }
  catch { throw new Error('Choose a valid time zone, such as Europe/London.'); }
  const result = { name: input.name.trim(), lat: input.lat, lon: input.lon, zoom: input.zoom, overviewZoom: input.overviewZoom, timeZone };
  const views = makeViews(result);
  for (const target of [views.view, views.overviewView]) {
    const [, y] = world(target.lon,target.lat,target.zoom);
    if (y < target.height/2 || y + target.height/2 > 256 * 2 ** target.zoom) throw new Error('This view crosses the polar map boundary. Increase zoom or move the centre.');
  }
  return result;
}
export function makeViews(settings) {
  const local = {width:1280,height:720,lat:settings.lat,lon:settings.lon,zoom:settings.zoom,radarZoom:Math.min(7,Math.ceil(settings.zoom))};
  const overview = {width:390,height:280,lat:settings.lat,lon:settings.lon,zoom:settings.overviewZoom,radarZoom:Math.min(7,Math.ceil(settings.overviewZoom))};
  return {view:local,overviewView:overview,viewKey:hash(local),overviewKey:hash(overview)};
}
