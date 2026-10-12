import {parseMetar,parseTAF} from 'metar-taf-parser';
const cloudNames={FEW:'Few clouds',SCT:'Scattered clouds',BKN:'Broken cloud',OVC:'Overcast',VV:'Vertical visibility'};
const weatherNames={MI:'shallow',PR:'partial',BC:'patches',DR:'low drifting',BL:'blowing',SH:'showers',TS:'thunderstorm',FZ:'freezing',DZ:'drizzle',RA:'rain',SN:'snow',SG:'snow grains',IC:'ice crystals',PL:'ice pellets',GR:'hail',GS:'small hail or snow pellets',UP:'unidentified precipitation',BR:'mist',FG:'fog',FU:'smoke',VA:'volcanic ash',DU:'dust',SA:'sand',HZ:'haze',PY:'spray',PO:'dust/sand whirls',SQ:'squall',FC:'funnel cloud',SS:'sandstorm',DS:'dust storm'};
const stamp=t=>Number.isFinite(new Date(t).getTime())?new Date(t).toISOString().replace('T',' ').slice(0,16)+' UTC':'unspecified';
export function reportDate(day,hour,minute,reference){
 const d=new Date(reference),candidates=[-1,0,1].map(offset=>Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset,day,hour,minute));
 return candidates.sort((a,b)=>Math.abs(a-reference)-Math.abs(b-reference))[0];
}
// Offset-bearing sections preserve exact source text, whitespace and repetitions.
// The library supplies international report/group dates; explanations retain
// uncertainty rather than using its experimental composite-forecast helper.
export function decodeAviation(raw,{product,issuedAt,observedAt,station}){
 let parsed,parseError=false;
 try{parsed=product==='taf'?parseTAF(raw,{issued:new Date(issuedAt)}):parseMetar(raw,{issued:new Date(observedAt)});}catch{parseError=true;}
 const tokens=[...raw.matchAll(/\S+/g)],sections=[];let period=parsed?.validity,trendIndex=0,inRemarks=false;
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i],code=token[0],start=token.index;let end=start+code.length,meaning=null,m;
  if(code==='RMK'){inRemarks=true;meaning='Remarks follow: supplementary information.';}
  else if(inRemarks)meaning=null;
  else if(['TEMPO','BECMG','INTER'].includes(code)||/^PROB(?:30|40)$/.test(code)||/^FM\d{6}$/.test(code)){
   let group=code;
   if(/^PROB/.test(code)&&tokens[i+1]?.[0]==='TEMPO'){group+=' '+tokens[++i][0];end=tokens[i].index+tokens[i][0].length;}
   if(/^\d{4}\/\d{4}$/.test(tokens[i+1]?.[0]??'')){group+=' '+tokens[++i][0];end=tokens[i].index+tokens[i][0].length;}
   const trend=parsed?.trends?.[trendIndex++];period=trend?.validity??period;
   meaning=group.startsWith('PROB')?`${code.slice(4)}% probability${group.includes('TEMPO')?' of temporary conditions':''}; not a definite forecast.`:code==='TEMPO'?'Temporary fluctuations during this period.':code==='BECMG'?'Conditions becoming different during this transition period.':code==='INTER'?'Intermittent conditions during this period.':'New prevailing conditions from this time.';
   if(period?.start)meaning+=` Period ${stamp(period.start)} to ${stamp(period.end)}.`;
  }
  else if(code==='TAF')meaning='Terminal Aerodrome Forecast: forecast weather at this aerodrome.';
  else if(code==='METAR'||code==='SPECI')meaning=code==='METAR'?'Routine aerodrome weather observation.':'Special aerodrome weather observation.';
  else if(code===station)meaning=`ICAO station identifier: ${station}.`;
  else if(code==='AMD'||code==='COR')meaning=code==='AMD'?'Amended report: replaces the earlier edition.':'Corrected report: fixes an earlier edition.';
  else if(code==='AUTO')meaning='Automated observation.';
  else if(code==='CNL')meaning='Forecast cancelled; this is not a forecast of good weather.';
  else if(code==='NIL')meaning='Report unavailable.';
  else if(/^\d{6}Z$/.test(code))meaning=`${product==='taf'?'Issued':'Observed'} ${stamp(product==='taf'?issuedAt:observedAt)}. Z means UTC.`;
  else if(/^\d{4}\/\d{4}$/.test(code)&&parsed?.validity?.start)meaning=`Forecast validity: ${stamp(parsed.validity.start)} to ${stamp(parsed.validity.end)}.`;
  else if((m=code.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/)))meaning=`Wind ${m[1]==='VRB'?'from a variable direction':Number(m[2])===0?'calm':`from ${Number(m[1])}° true`}, ${Number(m[2])} ${m[4]==='KT'?'knots':m[4]==='MPS'?'m/s':'km/h'}${m[3]?`, gusting ${Number(m[3])}`:''}.`;
  else if((m=code.match(/^(\d{3})V(\d{3})$/)))meaning=`Wind direction varies from ${Number(m[1])}° to ${Number(m[2])}° true.`;
  else if(code==='CAVOK')meaning='Visibility at least 10 km, no significant weather and no operationally significant cloud (including no CB/TCU).';
  else if(code==='NSW')meaning='No significant weather.';
  else if(/^\d{1,2}$/.test(code)&&/^\d\/\dSM$/.test(tokens[i+1]?.[0]??'')){const fraction=tokens[++i][0];end=tokens[i].index+fraction.length;meaning=`Prevailing visibility ${code} ${fraction.slice(0,-2)} statute miles.`;}
  else if((m=code.match(/^R(\d{2}[LCR]?)\/([PM]?)(\d{4})(?:V([PM]?)(\d{4}))?(FT)?([UDN])?$/)))meaning=`Runway ${m[1]} visual range ${m[2]==='M'?'less than ':m[2]==='P'?'greater than ':''}${Number(m[3])}${m[5]?` varying to ${m[4]==='M'?'less than ':m[4]==='P'?'greater than ':''}${Number(m[5])}`:''} ${m[6]?'feet':'metres'}${m[7]?'; '+({U:'increasing',D:'decreasing',N:'no distinct tendency'}[m[7]]):''}.`;
  else if((m=code.match(/^WS(\d{3})\/(\d{3})(\d{2,3})KT$/)))meaning=`Low-level wind shear at ${Number(m[1])*100} ft above aerodrome level; wind from ${Number(m[2])}° true at ${Number(m[3])} knots.`;
  else if(code==='NOSIG')meaning='No significant change expected in the trend period.';
  else if(code==='SKC'||code==='CLR'||code==='NSC'||code==='NCD')meaning={SKC:'Sky clear.',CLR:'No cloud detected below the reporting limit.',NSC:'No significant cloud.',NCD:'No cloud detected.'}[code];
  else if((m=code.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/)))meaning=`${cloudNames[m[1]]}${m[2]==='///'?', height unavailable':` at ${Number(m[2])*100} ft above aerodrome level`}${m[3]==='CB'?', cumulonimbus':m[3]==='TCU'?', towering cumulus':''}.`;
  else if((m=code.match(/^(M?\d{2})\/(M?\d{2})?$/)))meaning=`Temperature ${Number(m[1].replace('M','-'))} °C; dew point ${m[2]?Number(m[2].replace('M','-'))+' °C':'unavailable'}.`;
  else if((m=code.match(/^([QA])(\d{4})$/)))meaning=`QNH pressure ${m[1]==='Q'?Number(m[2])+' hPa':(Number(m[2])/100).toFixed(2)+' inHg'}.`;
  else if(/^\d{4}$/.test(code))meaning=`Prevailing visibility ${code==='9999'?'10 km or more':Number(code)+' metres'}.`;
  else if((m=code.match(/^([PM]?)(\d+(?:\/\d+)?|\d*\.\d+)SM$/)))meaning=`Visibility ${m[1]==='P'?'greater than ':m[1]==='M'?'less than ':''}${m[2]} statute miles.`;
  else if((m=code.match(/^(TX|TN)(M?\d{2})\/(\d{4})Z$/)))meaning=`Forecast ${m[1]==='TX'?'maximum':'minimum'} temperature ${Number(m[2].replace('M','-'))} °C; day ${m[3].slice(0,2)} at ${m[3].slice(2)}:00 UTC.`;
  else{
   const wx=code.replace(/^(RE|VC|\+|-)/,'');const parts=wx.match(/.{2}/g);
   if(parts&&parts.join('')===wx&&parts.every(p=>weatherNames[p]))meaning=`${code.startsWith('RE')?'Recent ':code.startsWith('VC')?'In the vicinity: ':code.startsWith('+')?'Heavy ':code.startsWith('-')?'Light ':''}${parts.map(p=>weatherNames[p]).join(' and ')}.`;
  }
  sections.push({start,end,meaning:meaning??'This section is not decoded. The original code is preserved.',known:!!meaning});
 }
 return {sections,parseError};
}
