// One active sequence and one replaceable request, with at most two images decoding.
// No second image cache: retain only the caller's current/pending sequence references.
export function createFrameLoader({ makeImage = () => new Image(), timeoutMs = 15000, sequenceTimeoutMs = 30000 } = {}) {
  let revision = 0, running = false, queued = null;
  const cancellations = new Set();
  function cancel() {
    revision++;
    if (queued) { queued.resolve(null); queued = null; }
    for (const stop of [...cancellations]) stop();
  }
  function decode(url) {
    return new Promise((resolve, reject) => {
      const image = makeImage();
      let timer, settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true; clearTimeout(timer); cancellations.delete(stop);
        if (error) { image.src = ''; reject(error); } else resolve(image);
      };
      const stop = () => finish(new Error('Image load cancelled'));
      cancellations.add(stop);
      timer = setTimeout(() => finish(new Error('Image load timed out')), timeoutMs);
      image.src = url;
      Promise.resolve().then(() => image.decode()).then(() => finish(), finish);
    });
  }
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queued) {
        const job = queued; queued = null;
        let expired = false;
        const valid = () => job.revision === revision && job.isCurrent();
        const current = () => !expired && valid();
        const deadline = setTimeout(() => {
          expired = true;
          for (const stop of [...cancellations]) stop();
        }, sequenceTimeoutMs);
        const reuse = new Map(job.reusable.map(frame => [`${frame.url}|${frame.overviewUrl}`, frame]));
        const result = new Array(job.frames.length);
        let cursor = 0;
        async function worker() {
          while (current() && cursor < job.frames.length) {
            const index = cursor++, frame = job.frames[index];
            const cached = reuse.get(`${frame.url}|${frame.overviewUrl}`);
            if (cached) { result[index] = {...cached,...frame}; continue; }
            try {
              const image = frame.url ? await decode(frame.url).catch(()=>null) : null;
              if (!current()) break;
              const overviewImage = frame.overviewUrl ? await decode(frame.overviewUrl).catch(()=>null) : null;
              if (current() && (image || overviewImage)) result[index] = { ...frame, url:image?frame.url:null,overviewUrl:overviewImage?frame.overviewUrl:null,image,overviewImage };
            } catch { /* Leave failed complete pairs as timeline gaps. */ }
          }
        }
        await Promise.all([worker(), worker()]);
        clearTimeout(deadline);
        job.resolve(valid() ? result.filter(Boolean) : null);
      }
    } finally { running = false; }
  }
  return {
    cancel,
    load(frames, reusable = [], isCurrent = () => true) {
      cancel();
      return new Promise(resolve => {
        queued = { frames: frames.slice(-37), reusable, isCurrent, revision, resolve };
        void drain();
      });
    },
  };
}
