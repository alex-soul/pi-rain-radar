// Shared scale and interval aggregation for the Grass Lab heatmap.
export const grassFactors=[
 {key:'rain',label:'Rain wetting',short:'Rain',color:'#69adf5',direction:1},
 {key:'dew',label:'Dew wetting',short:'Dew',color:'#65d7bd',direction:1},
 {key:'solar',label:'Sun drying',short:'Sun',color:'#e9bb60',direction:-1},
 {key:'wind',label:'Wind drying',short:'Wind',color:'#b39af0',direction:-1},
 {key:'air',label:'Air drying',short:'Air',color:'#ed9a7e',direction:-1},
 {key:'drainage',label:'Drainage',short:'Drainage',color:'#87bac1',direction:-1}
];
export const effectOpacity=rate=>Number.isFinite(rate)?Math.sqrt(Math.max(0,Math.min(1,rate/2))):0;
// Time-weighted rates, bounded to plot resolution. Unknown time is never zero.
// Contributions belong to (previous acquisition, current acquisition], including
// warm-up. Duplicate acquisitions and reset/initialization points emit no step.
export function effectBins(points,start,end,count){
 count=Math.max(1,Math.min(1200,Math.floor(count)));
 const width=(end-start)/count;
 const bins=Array.from({length:count},(_,i)=>({start:start+i*width,end:start+(i+1)*width,covered:0,rates:Object.fromEntries(grassFactors.map(f=>[f.key,0]))}));
 for(const point of points){
  const step=point.effects;if(!step||step.end<=start||step.start>=end)continue;
  const first=Math.max(0,Math.floor((step.start-start)/width)),last=Math.min(count-1,Math.ceil((step.end-start)/width)-1);
  for(let i=first;i<=last;i++){
   const bin=bins[i],duration=Math.max(0,Math.min(bin.end,step.end)-Math.max(bin.start,step.start));
   bin.covered+=duration;
   for(const {key}of grassFactors)bin.rates[key]+=step.rates[key]*duration;
  }
 }
 return bins.map(bin=>({...bin,coverage:Math.min(1,bin.covered/width),rates:Object.fromEntries(grassFactors.map(({key})=>[key,bin.covered?bin.rates[key]/bin.covered:null]))}));
}
