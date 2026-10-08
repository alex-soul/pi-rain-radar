// Presentation only. Absence preserves each element's theme-specific default.
export const opacityNames=['top','bottom','buttons','rain-forecast','astronomy','trends','stats'];
export const lookbacks=[2,4,6,12,24];
export function normalizeLocal(value={}) {
  const opacity={};
  for(const key of opacityNames)if(Number.isFinite(value?.opacity?.[key])&&value.opacity[key]>=0&&value.opacity[key]<=100)opacity[key]=value.opacity[key];
  const fonts={};for(const key of ['top','bottom','buttons','rain-forecast','astronomy','trends','stats','camera'])if(Number.isFinite(value?.fonts?.[key])&&value.fonts[key]>=75&&value.fonts[key]<=150)fonts[key]=value.fonts[key];
  return {opacity,fonts,lookback:lookbacks.includes(value?.lookback)?value.lookback:null};
}
let saved;try{saved=JSON.parse(localStorage.getItem('radar-local-ui'));}catch{}
export const localPreferences=normalizeLocal(saved);
export function saveLocalPreferences(){
  try{localStorage.setItem('radar-local-ui',JSON.stringify(localPreferences));}catch{}
  window.dispatchEvent(new Event('radar-local-preferences'));
}
export function trendWindow(start,end,hours){return {start:lookbacks.includes(hours)?end-hours*3600:start,end};}
export function captureInWindow(time,start,end){return Number.isFinite(time)&&time>=start&&time<=end;}
