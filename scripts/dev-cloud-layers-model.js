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
  {id:'convective', title:'CB / TCU', codes:'SCT018TCU BKN035CB', description:'Type stays in the footer cloud groups, without inventing the height of a cloud top.'},
  {id:'cavok', title:'CAVOK', codes:'CAVOK', description:'No operationally significant cloud reported. This does not establish a completely cloudless sky.'},
  {id:'clear', title:'Clear sky', codes:'SKC', description:'Explicit sky-clear report. Compare with CLR, NSC and NCD using the code field.'},
  {id:'obscured', title:'Obscured sky', codes:'VV002', description:'Vertical visibility into an obscured sky. The dashed marker is not a cloud base.'},
  {id:'unknown-vv', title:'Unknown visibility', codes:'VV///', description:'Sky obscured, but vertical visibility is unavailable. No height is invented.'},
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
export function plotTop(layers,units='m',fixed=0) {
  const factor=units==='m'?.3048:1;
  const highest=Math.max(0,...layers.filter(l=>l.baseFt!==null).map(l=>l.baseFt*factor));
  const steps=units==='m'?[500,1000,1500,2000,3000,5000,7500,10000,15000,20000,35000]:[2000,4000,6000,10000,15000,25000,35000,50000,75000,100000,120000];
  return Number(fixed)||steps.find(v=>v>=highest*1.18)||steps.at(-1);
}
export function randomCloud(seed) {
  let state=Number(seed)>>>0;
  return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
// Illustrative horizontal coverage, not a meteorological percentage or cloud depth.
// Keep genuine gaps between FEW/SCT/BKN banks; OVC alone spans the whole plot.
export function cloudBanks(amount,seed=7,irregularity=.5,size=1) {
  const rnd=randomCloud(seed),variation=Math.max(0,Math.min(1,irregularity));
  const profile={FEW:[2,.25],SCT:[4,.49],BKN:[3,.81],OVC:[1,1.04]}[amount];
  if(!profile)return [];
  const [normalCount,coverage]=profile;
  const cloudSize=Math.max(.5,Math.min(2,size));
  // Resize individual banks by redistributing the same category coverage.
  const count=amount==='OVC'?1:Math.max(1,Math.round(normalCount/cloudSize));
  const weights=Array.from({length:count},()=>.7+rnd()*1.3),total=weights.reduce((a,b)=>a+b,0);
  const gaps=Array.from({length:count+1},(_,i)=>(i===0||i===count?.35:1)*(.7+rnd()*.9));
  const gapTotal=gaps.reduce((a,b)=>a+b,0);
  let x=amount==='OVC'?-.02:gaps[0]/gapTotal*(1-coverage);
  return weights.map((weight,i)=>{
    const width=weight/total*coverage,start=x;
    x+=width+(gaps[i+1]/gapTotal)*(1-coverage);
    const peaks=Array.from({length:amount==='OVC'?Math.round(10/cloudSize):5},()=>({x:.08+rnd()*.84,height:.2+rnd()*.8,spread:.12+rnd()*.15}));
    return {start,width,height:14+rnd()*12,phase:rnd()*Math.PI*2,peaks,variation};
  });
}
export function cloudOutline(bank,span) {
  const width=bank.width*span,n=Math.max(24,Math.min(140,Math.ceil(width/3))),upper=[],lower=[];
  const samples=[];
  for(let i=0;i<=n;i++){
    const t=i/n,envelope=Math.pow(Math.sin(Math.PI*t),.35);
    const hills=bank.peaks.reduce((sum,p)=>sum+p.height*Math.exp(-(((t-p.x)/(p.spread*(1.25-bank.variation*.8)))**2)),0);
    const ripple=Math.sin(t*37+bank.phase)*Math.sin(t*17+bank.phase);
    // Irregularity changes local lobes and wisps; normalize out overall height.
    samples.push(envelope*(1+bank.variation*(hills*.9+ripple*.16)));
  }
  const peak=Math.max(...samples),height=Math.min(bank.height,width*.32);
  for(let i=0;i<=n;i++){
    const t=i/n,envelope=Math.pow(Math.sin(Math.PI*t),.35);
    upper.push([t*width,-samples[i]/peak*height]);
    lower.push([t*width,-envelope*(1.2+bank.variation*(.8+.7*Math.sin(t*24+bank.phase)))]);
  }
  const points=[...upper,...lower.reverse()];
  const number=v=>Number(v.toFixed(2));
  const mid=(a,b)=>[number((a[0]+b[0])/2),number((a[1]+b[1])/2)];
  let path=`M${mid(points.at(-1),points[0]).join(',')}`;
  for(let i=0;i<points.length;i++)path+=`Q${points[i].map(number).join(',')} ${mid(points[i],points[(i+1)%points.length]).join(',')}`;
  return path+'Z';
}
export function cloudFooter(report,{station,timestamp,dataState}) {
  const configured=dataState!=='not-configured'&&/^[A-Z0-9]{4}$/.test(station);
  const available=configured&&dataState!=='unavailable'&&report.state!=='missing';
  const stamp=/^(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])[0-5]\dZ$/.test(timestamp)?timestamp:'—';
  const health=dataState==='error'&&configured?'error':!available||stamp==='—'?'neutral':dataState==='stale'?'warning':'ready';
  const labels={ready:'METAR up to date',warning:'METAR stale',neutral:configured?'METAR missing':'METAR not configured',error:'METAR collection error'};
  return {health,label:labels[health],station:configured?station:'—',timestamp:available?stamp:'—',groups:available?report.raw:'—'};
}
