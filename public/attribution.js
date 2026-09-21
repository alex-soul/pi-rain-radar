import {frameProvider} from './playback.js';
export function visibleRadarSources({frame,observations=[],overviewVisible=false,currentSources={},archive=false}){
  const result=new Set();
  for(const [i,role] of ['main','overview'].entries()){
    if(role==='overview'&&!overviewVisible)continue;
    const source=observations[i]?.source??frameProvider(frame,role)??(!archive?currentSources[role]?.source:null);
    if(['rainviewer','rainbow'].includes(source))result.add(source);
  }
  return result;
}
export const weatherCreditVisible=({dockExpanded,forecastVisible})=>!!(dockExpanded||forecastVisible);
