export const aviationPanels=['metar','taf','clouds'];
export const panelNames={metar:'METAR',taf:'TAF',clouds:'Cloud layers'};
export function aviationGroup(saved){
  const state={split:saved?.split===true,selected:{},open:{}};
  for(const p of aviationPanels){
    state.selected[p]=typeof saved?.selected?.[p]==='boolean'?saved.selected[p]:true;
    state.open[p]=state.selected[p]&&saved?.open?.[p]===true;
  }
  return state;
}
export const groupVisible=state=>aviationPanels.some(p=>state.open[p]);
export function migrateAviationGroup(saved,layout,window){
  if(saved&&typeof saved==='object')return aviationGroup(saved);
  const selected={metar:layout?.visible?.metar!==false,taf:layout?.visible?.taf!==false,clouds:true};
  return aviationGroup({split:layout?.split===true,selected,open:{metar:window?.visible===true&&selected.metar,taf:window?.visible===true&&selected.taf,clouds:false}});
}
// The airplane hides the selected group; a cross also deselects its panel.
export function changeAviation(state,action){
  const next=aviationGroup(state);
  if(action.type==='toggle'){
    if(!groupVisible(state)&&!aviationPanels.some(p=>state.selected[p]))return {state:next,picker:true};
    for(const p of aviationPanels)next.open[p]=!groupVisible(state)&&state.selected[p];
  }else if(action.type==='close'){
    for(const p of action.panel==='text'?['metar','taf']:[action.panel])if(aviationPanels.includes(p)){next.open[p]=false;next.selected[p]=false;}
  }else if(action.type==='select'&&aviationPanels.includes(action.panel)){
    next.selected[action.panel]=!!action.value;
    next.open[action.panel]=groupVisible(state)&&!!action.value;
  }else if(action.type==='split')next.split=!!action.value;
  return {state:next,picker:false};
}
