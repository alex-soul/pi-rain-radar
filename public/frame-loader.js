// URLs/availability belong to the backend. Decoding never changes that metadata.
// Keep a small LRU of decoded images and at most two active decodes.
export function createFrameLoader({ makeImage = () => new Image(), timeoutMs = 15000, maxImages = 12 } = {}) {
  const cache = new Map(), jobs = new Map();
  let queue = [], active = 0, revision = 0;
  function trim() {
    while (cache.size > maxImages) {
      const key = cache.keys().next().value;
      cache.get(key).src = ''; cache.delete(key);
    }
  }
  function drain() {
    while (active < 2 && queue.length) {
      const job = queue.shift(); active++;
      const image = makeImage(); let done = false;
      const finish = success => {
        if (done) return; done = true; clearTimeout(timer); active--; jobs.delete(job.url);
        if (success && job.revision === revision) { cache.set(job.url, image); trim(); job.resolve(image); }
        else { image.src = ''; job.resolve(null); }
        drain();
      };
      job.stop = () => finish(false);
      const timer = setTimeout(() => finish(false), timeoutMs);
      image.src = job.url;
      Promise.resolve().then(() => image.decode()).then(() => finish(true), () => finish(false));
    }
  }
  function cancel() {
    revision++;
    const waiting = queue; queue = [];
    for (const job of waiting) { jobs.delete(job.url); job.resolve(null); }
    for (const job of [...jobs.values()]) job.stop?.();
  }
  function prepare(url, priority = true) {
    if (!url) return Promise.resolve(null);
    if (cache.has(url)) { const image = cache.get(url); cache.delete(url); cache.set(url, image); return Promise.resolve(image); }
    if (jobs.has(url)) {
      const job = jobs.get(url), index = queue.indexOf(job);
      if (priority && index >= 0) { queue.splice(index, 1); queue.unshift(job); }
      return job.promise;
    }
    let resolve;
    const promise = new Promise(r => resolve = r), job = { url, revision, resolve, promise };
    jobs.set(url, job); priority ? queue.unshift(job) : queue.push(job);
    // Rapid scrubbing discards obsolete queued work before it can grow unbounded.
    while (queue.length > 8) { const old = queue.pop(); jobs.delete(old.url); old.resolve(null); }
    drain(); return promise;
  }
  return {
    cancel, prepare,
    async load(frames, reusable = [], isCurrent = () => true) {
      cancel();
      const urls = new Set(frames.flatMap(f => [f.url, f.overviewUrl,f.cloudUrl,f.overviewCloudUrl]).filter(Boolean));
      for (const [url, image] of cache) if (!urls.has(url)) { image.src = ''; cache.delete(url); }
      return isCurrent() ? frames.map(f => ({ ...f })) : null;
    },
    metrics: () => ({ cached: cache.size, active, queued: queue.length }),
  };
}
