export const aviationProducts=['metar','taf'];
export const aviationNames={metar:'METAR',taf:'TAF'};
export function aviationAt(history,time){
 const state=history?.states?.findLast(s=>s.time<=time);
 if(!state)return {enabled:false,unknown:true,station:null,products:{},reports:{}};
 const reports=Object.fromEntries(aviationProducts.map(product=>[product,history.reports?.findLast(r=>r.product===product&&r.station===state.station&&r.acquiredAt<=time&&r.acquiredAt===state.products?.[product]?.reportAcquiredAt)??null]));
 return {...state,reports};
}
export function aviationHealth(state,product,time){
 if(state?.unknown)return 'unknown';
 if(!state?.enabled)return 'disabled';
 const check=state.products?.[product],report=state.reports?.[product];
 if(!check||check.state==='pending')return 'pending';
 if(check.state==='missing'||!report||report.cancelled)return 'error';
 if(product==='metar'&&time-report.observedAt>90*60000)return 'error';
 if(product==='taf'&&report.validTo&&time>=report.validTo)return 'error';
 return check.state==='error'||time-check.lastSuccess>15*60000?'warning':'ready';
}
export function aviationDetail(state,product,time){
 const health=aviationHealth(state,product,time),report=state.reports?.[product];
 const description={ready:'Available',warning:'Retained · collection interrupted',error:'Missing or unusable',pending:'Waiting for first check',disabled:'Collection disabled',unknown:'No recorded collection state'}[health];
 return {label:aviationNames[product],health,time:report?.acquiredAt/1000||null,description,station:state.station,observedAt:report?.observedAt,issuedAt:report?.issuedAt,validFrom:report?.validFrom,validTo:report?.validTo,lastSuccess:state.products?.[product]?.lastSuccess};
}
