export const resolveRadarSources=s=>({main:s.main,overview:s.overview==='same'?s.main:s.overview});
// Resolve both references before changing either; Same as Main must not escape a provider-off decision.
export function disableRadarProviders(selection,enabled){
  const effective=resolveRadarSources(selection),next={...selection};
  for(const role of ['main','overview'])if(effective[role]!=='disabled'&&!enabled(effective[role]))next[role]='disabled';
  return next;
}
export function maskLiveRadar(live,selection){
  const sources=resolveRadarSources(selection),off=role=>sources[role]==='disabled';
  const mask=frames=>(frames??[]).map(frame=>({...frame,
    ...(off('main')?{url:null,source:null,mainTime:null}:{}),
    ...(off('overview')?{overviewUrl:null,overviewSource:null,overviewTime:null}:{}),
    expectedSources:{...frame.expectedSources,...sources},
  })).filter(frame=>frame.url||frame.overviewUrl);
  const frames=mask(live.frames),coverage=(live.coverage??[]).map(slot=>({...slot,main:off('main')?false:slot.main,overview:off('overview')?false:slot.overview,sources:{...slot.sources,...sources}}));
  const counts=Object.fromEntries(['main','overview'].map(role=>[role,off(role)?{tracked:0,gapsSeen:0,lateArrivals:0,available:0,missing:0,total:0}:live.counts?.[role]]));
  return {...live,frames,frame:frames.at(-1)??null,borrowFrames:mask(live.borrowFrames),coverage,counts,playable:frames.length,
    radarDisabled:off('main')&&off('overview'),complete:coverage.every(slot=>['main','overview'].every(role=>off(role)||slot[role]))};
}
