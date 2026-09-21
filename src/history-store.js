import {Worker} from 'node:worker_threads';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {releaseLease} from './history-files.js';

const openDirectories = new Map();
const MAX_QUEUE = 64;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// This is the sole application-facing archive API. SQL and image/file work live
// in the worker; callers must handle backpressure instead of dropping writes.
export async function createHistoryStore(directory, options = {}) {
  directory = resolve(directory);
  if (openDirectories.has(directory)) throw Object.assign(new Error('Archive already open'), {code:'ARCHIVE_OPEN'});
  const leaseToken=randomUUID();
  openDirectories.set(directory,leaseToken);
  const forget=()=>{if(openDirectories.get(directory)===leaseToken)openDirectories.delete(directory);};
  let releasePromise;
  // Startup failure, explicit close and worker exit can converge. Complete one
  // owner cleanup before admitting another opener, including on Windows where
  // a concurrent read can prevent unlinking the owner file.
  const release=()=>releasePromise??=releaseLease(resolve(directory,'archive'),leaseToken).finally(forget);
  const worker = new Worker(new URL('./history-worker.js', import.meta.url), {
    workerData:{directory, options,leaseToken},
    // Dedicated file-backed worker: do not inherit CLI/test/inline-script flags,
    // some of which Node rejects when explicitly passed to Worker.
    execArgv:[],
  });
  let sequence = 0, closed = false, queuedBytes = 0;
  const pending = new Map();
  const fail = error => { for (const p of pending.values()){p.cleanup?.();p.reject(error);} pending.clear(); queuedBytes=0; };
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve=resolve; readyReject=reject; });
  const asError = value => Object.assign(new Error(value.message), {code:value.code});
  worker.on('message', message => {
    if (message.ready) return readyResolve();
    if (message.startError) return readyReject(asError(message.startError));
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);p.cleanup?.();
    queuedBytes-=p.bytes;
    if (message.error) p.reject(asError(message.error)); else p.resolve(message.result);
  });
  worker.on('error', error => { readyReject(error); fail(error); });
  worker.on('exit', () => {
    closed=true;
    void release().catch(()=>{});
    const error=Object.assign(new Error('Archive worker stopped'),{code:'ARCHIVE_CLOSED'});
    readyReject(error); fail(error);
  });
  function call(method, args={}, signal) {
    if (closed) return Promise.reject(Object.assign(new Error('Archive closed'),{code:'ARCHIVE_CLOSED'}));
    if(signal?.aborted)return Promise.reject(Object.assign(new Error('Archive read cancelled'),{code:'ABORT_ERR'}));
    let bytes;
    try {
      // Bound clone memory before posting into another isolate. Binary payloads
      // are counted separately instead of JSON-encoding each individual byte.
      bytes=(args.bytes?.byteLength??0)+Buffer.byteLength(JSON.stringify({...args,bytes:undefined}));
    } catch {return Promise.reject(Object.assign(new Error('Invalid archive input'),{code:'ARCHIVE_INPUT'}));}
    if(bytes>9*1024*1024)return Promise.reject(Object.assign(new Error('Archive request too large'),{code:'ARCHIVE_INPUT'}));
    if (pending.size >= MAX_QUEUE || queuedBytes+bytes>16*1024*1024) return Promise.reject(Object.assign(new Error('Archive busy; retry later'),{code:'ARCHIVE_BUSY'}));
    const id=++sequence;
    return new Promise((resolve,reject) => {
      const abort=()=>{worker.postMessage({cancel:id});reject(Object.assign(new Error('Archive read cancelled'),{code:'ABORT_ERR'}));};
      const cleanup=()=>signal?.removeEventListener('abort',abort);
      pending.set(id,{resolve,reject,bytes,cleanup});queuedBytes+=bytes;signal?.addEventListener('abort',abort,{once:true});
      try { worker.postMessage({id,method,args}); } catch(error) {pending.delete(id);queuedBytes-=bytes;reject(error);}
    });
  }
  try { await ready; } catch(error) {await worker.terminate();await release();throw error;}
  return {
    put: records => !Array.isArray(records)||records.length>128 ? Promise.reject(Object.assign(new Error('Invalid history batch'),{code:'ARCHIVE_INPUT'})) : call('put',{records}),
    publish(record, bytes) {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_IMAGE_BYTES)
        return Promise.reject(Object.assign(new Error('Invalid archive image size'),{code:'ARCHIVE_INPUT'}));
      return call('publish',{record,bytes});
    },
    range: (query,{signal}={}) => call('range',query,signal),
    latest: (query,{signal}={}) => call('latest',query,signal),
    lastGood: query => call('lastGood',query),
    calendar: (query,{signal}={}) => call('calendar',query,signal),
    extent: query => call('extent',query),
    boundary: query => call('boundary',query),
    contextBefore: query => call('contextBefore',query),
    setRetention: days => call('setRetention',{days}),
    maintain: options => call('maintain',options),
    status: () => call('status'),
    weatherState: source => call('weatherState',{source}),
    saveWeatherState: (source,value) => call('saveWeatherState',{source,value}),
    saveWeatherPolicy: value => call('saveWeatherPolicy',{value}),
    // Contexts eligible for last-good radar protection, independent of viewers.
    protect: contexts => call('protect',{contexts}),
    async close() {
      if (closed) return;
      try {await call('close');} finally {closed=true;await worker.terminate();await release();}
    },
  };
}
