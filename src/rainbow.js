import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const origin = 'https://api.rainbow.ai';
const monthOf = time => new Date(time).toISOString().slice(0, 7);
async function save(file, data) {
  await writeFile(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}
export class RainbowError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
// One shared client per appliance. Reserve before dispatch, including failed calls;
// a restart after reservation can overcount, but must never silently reset usage.
export async function createRainbow(directory, {
  request = fetch, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  testRequestLimit = null, monthlyLimit = () => null, inUse = () => false,
  onEvent = () => {}, enabled=()=>true, onNewKey=async()=>{}, validationTile = { zoom: 0, x: 0, y: 0 },
} = {}) {
  if (testRequestLimit !== null && (!Number.isSafeInteger(testRequestLimit) || testRequestLimit < 1)) throw new Error('Invalid Rainbow test request limit');
  const folder = join(directory, 'settings');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const keyFile = join(folder, 'rainbow.json'), usageFile = join(folder, 'rainbow-usage.json');
  let key = '', ledger = { month: monthOf(now()), tiles: 0, requests: 0, total: 0, retryAt: 0 };
  try {
    const saved = JSON.parse(await readFile(keyFile, 'utf8'));
    if (typeof saved.apiKey !== 'string' || (saved.apiKey && !/^[A-Za-z0-9._~-]{16,256}$/.test(saved.apiKey))) throw new Error();
    key = saved.apiKey;
  } catch (e) { if (e.code !== 'ENOENT') throw new Error('Stored Rainbow key is invalid. Restore settings/rainbow.json.'); }
  try {
    const saved = JSON.parse(await readFile(usageFile, 'utf8'));
    if (!/^\d{4}-\d{2}$/.test(saved.month) || ![saved.tiles, saved.total, saved.retryAt].every(v => Number.isSafeInteger(v) && v >= 0) || saved.tiles > saved.total) throw new Error();
    // Legacy ledgers have a lifetime total only: carry it forward conservatively.
    saved.requests ??= saved.total;
    if (!Number.isSafeInteger(saved.requests) || saved.requests < saved.tiles || saved.requests > saved.total) throw new Error();
    ledger = saved;
  } catch (e) { if (e.code !== 'ENOENT') throw new Error('Stored Rainbow usage is invalid. Restore it before making requests.'); }
  let queue = Promise.resolve(), lastRequest = -Infinity, configuring = false, active = 0, error = null, reportedLimit=false;
  const usage = () => ({ month: monthOf(now()), tiles: ledger.month === monthOf(now()) ? ledger.tiles : 0, requests: ledger.month === monthOf(now()) ? ledger.requests : 0, total: ledger.total, testRequestLimit });
  function serial(work) { const result = queue.then(work); queue = result.catch(() => {}); return result; }
  async function bytes(response, limit) {
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw new RainbowError('response', 'Rainbow returned an oversized response.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function call(path, apiKey, tile = false) {
    return serial(async () => {
      if(!enabled()&&!configuring)throw new RainbowError('disabled','Rainbow collection disabled.');
      if (!apiKey) throw new RainbowError('key', 'Configure a Rainbow API key first.');
      if (now() < ledger.retryAt) throw new RainbowError('rate', 'Rainbow requested a pause. Try again shortly.');
      const limit = monthlyLimit();
      if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1)) throw new RainbowError('limit', 'The monthly request limit is invalid.');
      if (testRequestLimit !== null && ledger.total >= testRequestLimit) throw new RainbowError('test-limit', 'The live test request allowance is exhausted.');
      const currentMonth = monthOf(now()), tiles = ledger.month === currentMonth ? ledger.tiles : 0;
      const requests = ledger.month === currentMonth ? ledger.requests : 0;
      if (limit !== null && requests >= limit) throw new RainbowError('limit', 'Monthly API-request limit reached. Updates are paused.');
      await sleep(Math.max(0, lastRequest + 850 - now()));
      if(!enabled()&&!configuring)throw new RainbowError('disabled','Rainbow collection disabled.');
      const reserved = { ...ledger, month: currentMonth, tiles: tiles + Number(tile), requests: requests + 1, total: ledger.total + 1 };
      await save(usageFile, reserved); ledger = reserved; lastRequest = now();
      if(!enabled()&&!configuring)throw new RainbowError('disabled','Rainbow collection disabled.');
      let response;
      try {
        response = await request(origin + path, { headers: { 'Ocp-Apim-Subscription-Key': apiKey }, signal: AbortSignal.timeout(20000), redirect: 'error' });
      } catch { throw new RainbowError('network', 'Rainbow could not be reached. Check the connection and try again.'); }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) {
          const seconds = Number(response.headers.get('retry-after'));
          const paused = { ...ledger, retryAt: now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60) * 1000 };
          await save(usageFile, paused); ledger = paused;
          throw new RainbowError('rate', 'Rainbow request rate exceeded. Updates are temporarily paused.');
        }
        if ([401, 403].includes(response.status)) throw new RainbowError('auth', 'Rainbow rejected the key or Tiles API access. Check the key and subscription.');
        throw new RainbowError('response', 'Rainbow could not supply the requested data. Try again later.');
      }
      return bytes(response, tile ? 2000000 : 16384);
    });
  }
  async function snapshot(apiKey) {
    let value;
    try { value = JSON.parse((await call('/tiles/v1/snapshot?layer=precip', apiKey)).toString()).snapshot; }
    catch (e) { if (e instanceof RainbowError) throw e; throw new RainbowError('response', 'Rainbow returned invalid snapshot data.'); }
    if (!Number.isSafeInteger(value) || value <= 0 || value % 600 !== 0 || value > now() / 1000 + 600 || value < now() / 1000 - 10800) throw new RainbowError('response', 'Rainbow returned an invalid or stale snapshot.');
    return value;
  }
  async function tileAt(time, tile, apiKey) {
    const { zoom, x, y } = tile;
    if (!Number.isSafeInteger(time) || time <= 0 || time % 600 || !Number.isInteger(zoom) || zoom < 0 || zoom > 12 || ![x,y].every(v => Number.isInteger(v) && v >= 0 && v < 2 ** zoom)) throw new RainbowError('input', 'Invalid Rainbow tile coordinates.');
    const data = await call(`/tiles/v1/precip/${time}/0/${zoom}/${x}/${y}?color=8&coverage=0`, apiKey, true);
    try {
      if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error();
      const info = await sharp(data, { limitInputPixels: 65536 }).metadata();
      if (info.width !== 256 || info.height !== 256) throw new Error();
      await sharp(data, { limitInputPixels: 65536 }).stats();
    } catch { throw new RainbowError('image', 'Rainbow returned an invalid tile image.'); }
    return data;
  }
  async function acquisition(work) {
    if (configuring) throw new RainbowError('busy', 'Rainbow key validation is in progress.');
    active++;
    try { const result = await work(key); error = null; return result; }
    catch (e) { error = e instanceof RainbowError ? e.message : 'Rainbow is unavailable.'; onEvent('rainbow-error'); throw e; }
    finally { active--; }
  }
  return {
    configured: () => !!key,
    status: () => {
      const counts=usage(),limit=monthlyLimit();
      const limitError=testRequestLimit!==null&&counts.total>=testRequestLimit?'The live test request allowance is exhausted.':limit!==null&&counts.requests>=limit?'Monthly API-request limit reached. Updates are paused.':null;
      if(limitError&&!reportedLimit)onEvent('rainbow-limit');reportedLimit=!!limitError;
      return {configured:!!key,error:limitError||error,checking:configuring,usage:counts};
    },
    getHistory: () => acquisition(async apiKey => { const time = await snapshot(apiKey); return Array.from({ length: 13 }, (_,i) => ({ time: time - (12-i)*600, source: 'rainbow' })); }),
    getTile: (frame, tile) => acquisition(apiKey => tileAt(frame.time, tile, apiKey)),
    async configure(value) {
      if (typeof value !== 'string' || (value && !/^[A-Za-z0-9._~-]{16,256}$/.test(value))) return { status: 400, error: 'Enter a valid Rainbow API key.' };
      if (configuring || active) return { status: 409, error: 'Rainbow is busy. Please try again shortly.' };
      if (!value && inUse()) return { status: 409, error: 'Switch both maps away from Rainbow before removing its key.' };
      configuring = true;
      try {
        let checkedSnapshot = null;
        if (value) { checkedSnapshot = await snapshot(value); await tileAt(checkedSnapshot, validationTile, value); }
        if(!key||!value)await onNewKey();
        await save(keyFile, { apiKey: value }); key = value; error = null; onEvent('rainbow-key');
        return { status: 200, configured: !!key, checkedSnapshot, usage: usage() };
      } catch (e) {
        const message = e instanceof RainbowError ? e.message : 'Could not save Rainbow settings. The previous key is unchanged.';
        onEvent('rainbow-key-error');
        return { status: e.code === 'auth' ? 400 : e.code === 'test-limit' || e.code === 'limit' || e.code === 'rate' ? 429 : 503, error: message, configured: !!key, usage: usage() };
      } finally { configuring = false; }
    },
  };
}
