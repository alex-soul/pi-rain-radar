export function playbackState(intent, count, archive = false) {
  return !intent ? 'paused' : count >= 2 ? 'playing' : archive ? 'paused' : 'waiting';
}
export function mapObservation(frames, index, role, archive = false) {
  const frame = frames[index]; if (!frame) return null;
  const urlKey = role === 'main' ? 'url' : 'overviewUrl';
  const sourceKey = role === 'main' ? 'source' : 'overviewSource';
  if (frame[urlKey]) return { url: frame[urlKey], source: frame[sourceKey], time: frame.time, borrowed: false };
  if (archive) return null;
  const expected = frame.expectedSources?.[role];
  const previous = [...(frames.borrowFrames??[]), ...frames.slice(0,index)];
  for (let i = previous.length - 1; i >= 0; i--) {
    const prior = previous[i];
    if (frame.time - prior.time >= 1800) break;
    if (expected && prior.expectedSources?.[role] && expected !== prior.expectedSources[role]) break;
    if (prior[urlKey] && (!expected || prior[sourceKey] === expected))
      return { url: prior[urlKey], source: prior[sourceKey], time: prior.time, borrowed: true };
  }
  return null;
}

const knownProvider = source => ['rainviewer','rainbow'].includes(source) ? source : null;
export function frameProvider(frame, role) {
  return knownProvider(frame?.[role === 'main' ? 'source' : 'overviewSource']) ?? knownProvider(frame?.expectedSources?.[role]);
}
export function windowProviders(frames) {
  const providers = new Set();
  for (const frame of [...frames, ...(frames.borrowFrames ?? [])])
    for (const role of ['main','overview']) { const source=frameProvider(frame,role); if(source)providers.add(source); }
  for (const slot of frames.coverage ?? [])
    for (const source of Object.values(slot.sources ?? {})) if(knownProvider(source))providers.add(source);
  return providers;
}
