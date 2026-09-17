import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { makeViews, radarTiles } from './map.js';

const scrypt = promisify(derive);
export const SESSION_MS = 5 * 60_000;
async function read(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function save(path, value) {
  const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await rename(temp, path);
}
export async function setPin(directory, pin) {
  if (!/^\d{6}$/.test(pin)) throw new Error('Use exactly six digits.');
  const folder = join(directory, 'settings');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(pin, salt, 64)).toString('hex');
  await save(join(folder, 'pin.json'), { salt, hash });
}
export async function disablePin(directory) {
  const folder = join(directory, 'settings');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await save(join(folder, 'pin.json'), { disabled: true });
}
export function createSettingsAuth(directory, now = Date.now) {
  const folder = join(directory, 'settings');
  const sessions = new Map();
  let busy = false;
  async function credentials() {
    const config = await read(join(folder, 'pin.json'));
    if (config?.disabled === true) return null;
    return config;
  }
  return {
    async configured() { return !!await credentials(); },
    async configure(input, token) {
      if (busy) return { status: 429, retryAfter: 2 };
      busy = true;
      try {
        if (!await this.authorized(token)) return { status: 401 };
        if (!input || typeof input.enabled !== 'boolean') return { status: 400, error: 'Choose whether to enable PIN protection.' };
        if (input.enabled && (typeof input.pin !== 'string' || !/^\d{6}$/.test(input.pin))) return { status: 400, error: 'Use exactly six digits.' };
        if (input.enabled && input.pin !== input.confirmation) return { status: 400, error: 'PINs do not match.' };
        if (input.enabled) await setPin(directory, input.pin);
        else await disablePin(directory);
        sessions.clear();
        return { status: 200, configured: input.enabled };
      } finally { busy = false; }
    },
    async unlock(pin) {
      if (busy) return { status: 429, retryAfter: 2 };
      busy = true;
      try {
        const config = await credentials();
        if (!config) return { status: 409 };
        const attempts = await read(join(folder, 'attempts.json')) || { failures: 0, until: 0 };
        if (attempts.until > now()) return { status: 429, retryAfter: Math.ceil((attempts.until - now()) / 1000) };
        const validFormat = typeof pin === 'string' && /^\d{6}$/.test(pin);
        const candidate = validFormat ? await scrypt(pin, config.salt, 64) : null;
        const expected = Buffer.from(config.hash, 'hex');
        if (!candidate || candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
          const failures = attempts.failures + 1;
          const retryAfter = Math.min(300, 2 ** Math.min(failures, 9));
          await save(join(folder, 'attempts.json'), { failures, until: now() + retryAfter * 1000 });
          return { status: 401, retryAfter };
        }
        await save(join(folder, 'attempts.json'), { failures: 0, until: 0 });
        for (const [token, session] of sessions) if (session.expiresAt <= now()) sessions.delete(token);
        if (sessions.size >= 16) sessions.delete(sessions.keys().next().value);
        const token = randomBytes(32).toString('hex');
        const expiresAt = now() + SESSION_MS;
        sessions.set(token, { expiresAt, hash: config.hash });
        return { status: 200, token, expiresAt };
      } finally { busy = false; }
    },
    async authorized(token) {
      const config = await credentials();
      if (!config) return true;
      const session = sessions.get(token);
      if (!session) return false;
      if (session.expiresAt <= now() || config?.hash !== session.hash) {
        sessions.delete(token); return false;
      }
      return true;
    },
    lock(token) { sessions.delete(token); },
  };
}

export function settingsRoutes(auth, weather = null, maps = null, { diagnostics, radarSettings, rainbow, power } = {}) {
  return async (req, res, path) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === 'GET' && path === '/api/settings/auth') return send(200, { configured: await auth.configured() });
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      if (req.method === 'POST') {
        // No cross-origin mutations; JSON/custom headers also prevent simple form submissions.
        if (req.headers['content-type'] !== 'application/json' ||
          (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) ||
          req.headers['sec-fetch-site'] === 'cross-site') return send(403, {});
        if (path === '/api/settings/lock') { auth.lock(token); return send(200, {}); }
        if (path === '/api/settings/unlock' || path === '/api/settings/pin') {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 256) return send(413, {});
          }
          let input;
          try { input = JSON.parse(body); } catch { return send(400, {}); }
          const result = path.endsWith('/pin') ? await auth.configure(input, token) : await auth.unlock(input?.pin);
          if (result.retryAfter) res.setHeader('Retry-After', String(result.retryAfter));
          return send(result.status, result);
        }
      }
      if(path==='/api/settings/power'&&(req.method==='GET'||req.method==='POST')) {
        if(!await auth.authorized(token))return send(401,{});
        if(!power)return send(503,{});
        if(req.method==='GET')return send(200,await power.status());
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>256)return send(413,{});}
        let input;try{input=JSON.parse(body);}catch{return send(400,{});}
        const result=await power.execute(input);return send(result.status,result);
      }
      if (path === '/api/settings/rainbow' && req.method === 'GET') {
        if (!await auth.authorized(token)) return send(401, {});
        if(!rainbow)return send(503,{});
        const views=maps?makeViews(maps.current().settings):null;
        return send(200,{...rainbow.status(),...(views?{tilesPerView:{main:radarTiles(views.view).length,overview:radarTiles(views.overviewView).length}}:{})});
      }
      if ((path === '/api/settings/openweather' || path === '/api/settings/map' || path === '/api/settings/map/preview' || path === '/api/settings/radar' || path === '/api/settings/rainbow') && req.method === 'POST') {
        if (!await auth.authorized(token)) return send(401, {});
        const mapRequest = path.startsWith('/api/settings/map');
        const radarRequest = path === '/api/settings/radar';
        const rainbowRequest = path === '/api/settings/rainbow';
        if (rainbowRequest ? !rainbow : radarRequest ? !radarSettings : mapRequest ? !maps : !weather) return send(503, {});
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > (mapRequest ? 1024 : rainbowRequest ? 512 : 256)) return send(413, {});
        }
        let input;
        try { input = JSON.parse(body); } catch { return send(400, {}); }
        const result = rainbowRequest ? await rainbow.configure(input?.apiKey) : radarRequest ? await radarSettings.configure(input) : mapRequest ? (path.endsWith('/preview') ? await maps.preview(input) : maps.configure(input)) : await weather.configure(input.apiKey);
        if (result.retryAfter) res.setHeader('Retry-After', String(result.retryAfter));
        return send(result.status, result);
      }
      if (path === '/api/settings/diagnostics' && req.method === 'GET') {
        if (!await auth.authorized(token)) return send(401, {});
        return diagnostics ? send(200, diagnostics.snapshot()) : send(503, {});
      }
      if (path === '/api/settings' && req.method === 'GET') {
        if (!await auth.authorized(token)) return send(401, {});
        return send(200, { pinConfigured: await auth.configured(), apiKeyConfigured: weather?.configured() || false, ...(radarSettings ? { radar: radarSettings.current() } : {}), ...(maps ? {map:maps.current().settings,mapUpdate:maps.status()} : {}) });
      }
      return send(405, {});
    } catch { return send(503, { error: 'Settings unavailable' }); }
  };
}
