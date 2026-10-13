// DEV presentation model. Cloud groups only, not a full METAR decoder.
export const cloudScenarios = [
  {id:'layered', title:'Three layers', codes:'FEW006 BKN014 OVC028', description:'Low fragments, a broken middle layer and overcast above. Compare spacing and coverage.'},
  {id:'coverage-comparison', title:'Coverage comparison', codes:'FEW006 SCT014 BKN028 OVC042', description:'Compare sparse FEW, scattered SCT, broad broken BKN and continuous OVC. Heights separate the examples; drawn thickness is illustrative.'},
  {id:'few', title:'A few clouds', codes:'FEW025', description:'A sparse layer at 2,500 ft. Compare FEW with SCT at the same height.'},
  {id:'scattered', title:'Scattered', codes:'SCT025', description:'Same base as the previous case, with more cloud coverage.'},
  {id:'broken', title:'Broken', codes:'BKN025', description:'Mostly cloud with visible gaps. Coverage is a category, not a precise percentage.'},
  {id:'overcast', title:'Overcast', codes:'OVC025', description:'A continuous band. Its drawn thickness is illustrative; the report gives only its base.'},
  {id:'low', title:'Low ceiling', codes:'BKN003 OVC008', description:'Two very low layers. Compare automatic scale with a fixed 3,000 m range.'},
  {id:'close', title:'Close layers', codes:'FEW010 SCT012 BKN015', description:'Crowded bases test readability. The footer retains all reported cloud groups.'},
  {id:'high', title:'Low and high', codes:'SCT008 BKN060 OVC180', description:'A wide height range compresses lower layers. Try a taller widget.'},
  {id:'convective', title:'CB / TCU', codes:'SCT018TCU BKN035CB', description:'Mixed types with subtle internal shading. The outer cloud shapes and thickness remain illustrative; no measured tops or towers are drawn.'},
  {id:'cb', title:'CB', codes:'BKN025CB', description:'Compare with Broken and TCU: same BKN coverage, 2,500 ft base, seed and outline. CB adds cool shadow pockets inside the existing banks; this is a type cue, not measured storm structure.'},
  {id:'tcu', title:'TCU', codes:'BKN025TCU', description:'Compare with Broken and CB: identical base and outline. TCU adds soft light mottling inside the existing banks, without increasing cloud height. Turn off CB / TCU shading to compare the codes-only alternative.'},
  {id:'cavok', title:'CAVOK', codes:'CAVOK', description:'Empty chart, with CAVOK retained in the footer. No operationally significant cloud reported; this does not establish a completely cloudless sky.'},
  {id:'clear', title:'Clear sky', codes:'SKC', description:'Explicit sky-clear report: empty chart, with SKC retained in the footer. Compare with CLR, NSC and NCD using the code field.'},
  {id:'obscured', title:'Obscured · VV002', codes:'VV002', description:'Sky obscured; vertical visibility 200 ft (about 61 m). Compare with OVC002: the dashed VV marker is a visibility measurement, not a cloud base or fog top.'},
  {id:'obscured-higher', title:'Obscured · VV010', codes:'VV010', description:'Vertical visibility 1,000 ft (about 305 m). Move the height slider to compare different reported visibility values.'},
  {id:'obscured-zero', title:'Obscured · VV000', codes:'VV000', description:'A numeric zero group stays at the ground line; it must not be treated as unknown. The code has limited reporting precision.'},
  {id:'overcast-low', title:'Overcast · OVC002', codes:'OVC002', description:'A reported overcast cloud base at 200 ft (about 61 m). Compare with VV002 at the same numerical height; this one is a cloud layer.'},
  {id:'unknown-vv', title:'Obscured · VV///', codes:'VV///', description:'Sky obscured, but vertical visibility is unavailable. No height is invented.'},
  {id:'missing-height', title:'Unknown base', codes:'SCT/// BKN020', description:'One layer has no reported base. Its /// group stays in the footer without being plotted at zero.'},
  {id:'missing', title:'No cloud data', codes:'', description:'Missing data must look different from a clear report. Select Three layers to recover.'}
];
const emptyStates = {SKC:'Sky clear', CLR:'No cloud detected within reporting limits', NSC:'No significant cloud reported', NCD:'No cloud detected', CAVOK:'No operationally significant cloud reported'};
export function parseCloudGroups(input) {
  const raw=String(input).trim().toUpperCase();
  if(!raw)return {raw, layers:[], message:'Cloud information unavailable', state:'missing'};
  if(Object.hasOwn(emptyStates,raw))return {raw,layers:[],message:emptyStates[raw],state:'clear'};
  const tokens=raw.split(/\s+/);
  if(tokens.length>4)throw Error('This preview supports up to four cloud groups.');
  const layers=tokens.map(code=>{
    const m=/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/.exec(code);
    if(!m||m[1]==='VV'&&m[3])throw Error(`“${code}” is not a supported cloud group. Try BKN014, SCT/// or VV002.`);
    return {code,amount:m[1],baseFt:m[2]==='///'?null:Number(m[2])*100,type:m[3]||''};
  });
  if(layers.some(l=>l.amount==='VV')&&layers.length>1)throw Error('Use VV on its own for the obscured-sky scenario.');
  return {raw:tokens.join(' '),layers,state:'layers',message:''};
}
export {plotTop,randomCloud,cloudBanks,cloudOutline,cloudFooter,verticalVisibility} from '../public/cloud-layers-model.js';
