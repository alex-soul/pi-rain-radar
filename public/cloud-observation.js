// Presentation adapter only: uses the shared Aviation collection/history, never polls.
export function cloudObservation(state,time){
  const metar=state?.reports?.metar,check=state?.products?.metar;
  const configured=!!state?.enabled&&/^[A-Z0-9]{4}$/.test(state?.station??'');
  const match=!!metar&&metar.station===state?.station;
  const expired=match&&Number.isFinite(metar.observedAt)&&time-metar.observedAt>90*60000;
  const overdue=Number.isFinite(check?.lastSuccess)&&time-check.lastSuccess>15*60000;
  const failed=check?.state==='error'||match&&metar?.clouds?.state==='error';
  const usable=match&&!metar.cancelled&&!expired&&metar.observedAt<=time&&!!metar.clouds&&!['missing','error'].includes(metar.clouds.state)&&check?.state!=='missing';
  const dataState=!configured?'not-configured':failed?'error':expired?'expired':overdue?'stale':!usable?'unavailable':'fresh';
  const report=configured&&usable?metar.clouds:{raw:'',layers:[],state:'missing',message:!configured?'METAR not configured':expired?'METAR expired':failed?'Cloud observation unavailable':'Cloud information unavailable'};
  return {report,station:state?.station??'',timestamp:metar?.clouds?.timestamp??'',dataState,seed:metar?.clouds?.seed??7,
    observedAt:match?metar.observedAt:null,acquiredAt:match?metar.acquiredAt:null,lastSuccess:check?.lastSuccess??null};
}
