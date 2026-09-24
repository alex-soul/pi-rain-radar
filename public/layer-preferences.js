export function layerPreferences(saved,legacy={},cloudVisible=true){
 const opacity=(value,fallback)=>Number.isFinite(value)?Math.max(0,Math.min(100,value)):fallback;
 return Object.fromEntries(['main','overview'].map(role=>[role,Object.fromEntries(['rain','cloud'].map(layer=>{
  const value=saved?.[role]?.[layer];return [layer,{visible:typeof value?.visible==='boolean'?value.visible:layer==='rain'||cloudVisible,opacity:opacity(value?.opacity,opacity(legacy?.[layer],layer==='rain'?80:65))}];
 }))]));
}
