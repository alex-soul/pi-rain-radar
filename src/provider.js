const endpoint = "https://api.rainviewer.com/public/weather-maps.json";
export function pastObservations(manifest) {
  const host = new URL(manifest.host);
  if (
    host.protocol !== "https:" ||
    host.hostname !== "tilecache.rainviewer.com" ||
    host.port ||
    host.username ||
    host.password
  )
    throw new Error("Unexpected radar tile host");
  const frames = manifest.radar?.past;
  if (!Array.isArray(frames) || !frames.length)
    throw new Error("No past radar frames available");
  for (const frame of frames) {
    if (
      !Number.isSafeInteger(frame.time) ||
      frame.time <= 0 ||
      !/^\/v2\/radar\/[a-zA-Z0-9_-]+$/.test(frame.path)
    )
      throw new Error("Invalid radar frame metadata");
  }
  const sorted = [
    ...new Map(frames.map((frame) => [frame.time, frame])).values(),
  ].toSorted((a, b) => a.time - b.time);
  const newest = sorted.at(-1).time;
  return sorted
    .filter((frame) => frame.time >= newest - 7200)
    .slice(-13)
    .map((frame) => ({ ...frame, host: host.origin }));
}
export function latestObservation(manifest) {
  return pastObservations(manifest).at(-1);
}
let lastRequest = 0;
let requestQueue = Promise.resolve();
function throttle() {
  const turn = requestQueue.then(async () => {
  const wait = Math.max(0, lastRequest + 850 - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest = Date.now();
  });
  requestQueue = turn.catch(() => {});
  return turn;
}
export async function getHistory({enabled=()=>true}={}) {
  if(!enabled())throw Error('RainViewer collection disabled');
  await throttle();
  if(!enabled())throw Error('RainViewer collection disabled');
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "PiRainRadar/0.1 (personal home display)" },
  });
  if (!response.ok) throw new Error(`Radar metadata HTTP ${response.status}`);
  return pastObservations(await response.json());
}
export async function getTile(frame, tile, {enabled=()=>true}={}) {
  if(!enabled())throw Error('RainViewer collection disabled');
  await throttle();
  if(!enabled())throw Error('RainViewer collection disabled');
  const url = `${frame.host}${frame.path}/256/${tile.zoom}/${tile.x}/${tile.y}/2/1_0.png`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "PiRainRadar/0.1 (personal home display)" },
  });
  if (!response.ok) throw new Error(`Radar tile HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (
    data.length > 2000000 ||
    data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    throw new Error("Invalid radar tile image");
  return data;
}
