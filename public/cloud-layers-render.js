import {plotTop,cloudBanks,cloudOutline,verticalVisibility} from './cloud-layers-model.js';
function cloudBand(layer,index,y,left,right,state){
  const span=right-left,seed=state.seed+index*971+layer.amount.charCodeAt(0)*31;
  const banks=cloudBanks(layer.amount,seed,state.texture/100,state.cloudSize/100);
  const silhouettes=banks.map(bank=>`<path d="${cloudOutline(bank,span)}" transform="translate(${left+bank.start*span} ${y}) scale(1 ${state.cloudSize/100})"/>`).join('');
  // Both softening passes are clipped to a small layer strip, not the entire card.
  // Type cues only recolour the same paths: no change in base, outline or extent.
  const typed=state.convectiveShading&&['CB','TCU'].includes(layer.type),cb=layer.type==='CB';
  const typeDefs=typed?`<defs><radialGradient id="type-soft-${index}"><stop stop-color="var(${cb?'--cloud-cb':'--cloud-tcu'})" stop-opacity="${cb?.95:.85}"/><stop offset="1" stop-color="var(${cb?'--cloud-cb':'--cloud-tcu'})" stop-opacity="0"/></radialGradient><pattern id="type-pattern-${index}" patternUnits="userSpaceOnUse" width="${cb?43:27}" height="24"><ellipse cx="${cb?12:7}" cy="10" rx="${cb?18:10}" ry="13" fill="url(#type-soft-${index})"/><ellipse cx="${cb?38:24}" cy="25" rx="${cb?13:8}" ry="10" fill="url(#type-soft-${index})"/></pattern></defs>`:'';
  const shading=typed?`<g class="cloud-type-shading" fill="url(#type-pattern-${index})" opacity="${cb?.7:.65}">${silhouettes}</g>`:'';
  return `${typeDefs}<g data-cloud-type="${layer.type||'ordinary'}" opacity="${state.cloudOpacity/100}"><g fill="var(--cloud)" opacity=".22" filter="url(#cloud-halo-${index})">${silhouettes}</g><g filter="url(#cloud-edge-${index})"><g fill="url(#cloud-fill-${index})">${silhouettes}</g>${shading}</g></g>`;
}
export function cloudPresentation(report,state){
  const font=state.font/100,units=state.units,factor=units==='m'?.3048:1;
  const width=state.width-14,height=state.height,right=width-2,top=10,bottom=height-10*font;
  const ceiling=plotTop(report.layers,units,state.scale?(units==='m'?state.scale:state.scale/.3048):0);
  const toY=base=>bottom-base*factor/ceiling*(bottom-top),num=value=>Math.round(value).toLocaleString('en-GB');
  // Fit the numeric gutter to the selected scale and font, without a unit heading.
  const left=Math.ceil(num(ceiling).length*6*font)+5;
  const ticks=(bottom-top)/4<14*font?[0,.5,1]:[0,.25,.5,.75,1];
  const grid=ticks.map(ratio=>{const y=bottom-ratio*(bottom-top);return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="currentColor" stroke-opacity="${ratio===0?.4:.12}"/><text x="${left-4}" y="${y+3}" text-anchor="end" fill="currentColor" opacity=".65" font-size="${10*font}">${num(ceiling*ratio)}</text>`;}).join('');
  const vv=verticalVisibility(report,units),showVV=vv&&!['not-configured','unavailable','expired'].includes(state.dataState);
  let layers='',cloudDefs='',message=report.state==='clear'?'':report.message,clipped=0;
  if(showVV&&state.vvStyle==='haze')layers+=`<rect class="vv-haze" x="${left}" y="${top}" width="${right-left}" height="${Math.max(1,bottom-top)}" fill="url(#obscuration)" opacity="${state.cloudOpacity/100}"/>`;
  if(state.dataState==='not-configured')message='METAR not configured';
  else if(state.dataState==='expired')message='METAR expired';
  else if(state.dataState==='unavailable')message='Cloud observation unavailable';
  else for(const [index,layer] of [...report.layers].sort((a,b)=>(b.baseFt??0)-(a.baseFt??0)).entries()){
    if(layer.baseFt===null)continue;if(layer.baseFt*factor>ceiling){clipped++;continue;}
    const y=toY(layer.baseFt),size=state.cloudSize/100;
    if(layer.amount==='VV')layers+=`<line class="vv-marker" x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity=".8" stroke-dasharray="4 4"/>`;
    else {
      cloudDefs+=`<linearGradient id="cloud-fill-${index}" gradientUnits="userSpaceOnUse" x1="0" y1="-32" x2="0" y2="2"><stop stop-color="var(--cloud-highlight)" stop-opacity=".3"/><stop offset=".35" stop-color="var(--cloud-highlight)" stop-opacity=".9"/><stop offset=".7" stop-color="var(--cloud)" stop-opacity=".82"/><stop offset="1" stop-color="var(--cloud)" stop-opacity=".25"/></linearGradient><filter id="cloud-halo-${index}" filterUnits="userSpaceOnUse" x="${left-5}" y="${y-40*size}" width="${right-left+10}" height="${46*size}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.6"/></filter><filter id="cloud-edge-${index}" filterUnits="userSpaceOnUse" x="${left-3}" y="${y-38*size}" width="${right-left+6}" height="${43*size}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation=".55"/></filter>`;
      layers+=cloudBand(layer,index,y,left,right,state);
    }
  }
  if(!message&&report.layers.length&&report.layers.every(l=>l.baseFt===null))message=report.layers[0].amount==='VV'?'Sky obscured\nVV unknown':'Cloud base unavailable';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cloud bases in ${units==='m'?'metres':'feet'} above the aerodrome"><defs>${cloudDefs}<linearGradient id="obscuration" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--cloud)" stop-opacity=".15"/><stop offset="1" stop-color="var(--cloud)" stop-opacity="1"/></linearGradient><clipPath id="sky-clip"><rect x="${left}" y="0" width="${Math.max(1,right-left)}" height="${bottom}"/></clipPath></defs>${grid}<g clip-path="url(#sky-clip)">${layers}</g></svg>`;

  const detail=[report.raw||'Cloud observation unavailable',report.state==='clear'?report.message:'',report.layers.some(l=>l.baseFt===null)?'Some cloud heights are unavailable.':'',vv? (vv.value===null?'Sky obscured; vertical visibility unknown.':vv.label+' above the aerodrome; not a cloud base or measured top.'):'',clipped?clipped+' layer(s) above the selected scale.':''].filter(Boolean).join(' · ');
  return {svg,message,detail,clipped,ceiling,vv,showVV,left};
}
