// Universal Blue anchors shared visually with the dock legend. Rain-rate
// positions use Marshall–Palmer Z=200 R^1.6; this is an approximate display
// conversion, not a claim that forecast rates equal measured reflectivity.
export const rainRateAtDbz=dbz=>(10**(dbz/10)/200)**(1/1.6);
export const rainColourStops=Object.freeze([
  [0,'#88ddee'],[rainRateAtDbz(15),'#88ddee'],
  [rainRateAtDbz(20),'#00a3e0'],[rainRateAtDbz(25),'#0077aa'],
  [rainRateAtDbz(30),'#005588'],[rainRateAtDbz(35),'#ffee00'],
  [rainRateAtDbz(40),'#ffaa00'],[rainRateAtDbz(45),'#ff4400'],
  [rainRateAtDbz(50),'#c10000'],
].map(Object.freeze));
export function rainColour(rate){
  const upper=rainColourStops.findIndex(([value])=>value>rate);
  if(upper<0)return rainColourStops.at(-1)[1];
  if(!upper)return rainColourStops[0][1];
  const [a,ca]=rainColourStops[upper-1],[b,cb]=rainColourStops[upper],fraction=(rate-a)/(b-a);
  return '#'+[1,3,5].map(i=>Math.round(parseInt(ca.slice(i,i+2),16)*(1-fraction)+parseInt(cb.slice(i,i+2),16)*fraction).toString(16).padStart(2,'0')).join('');
}
export function rainGradientStops(scale){
  if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid rain chart scale');
  return [...rainColourStops.filter(([rate])=>rate<scale).map(([rate,colour])=>({offset:rate/scale,colour})),{offset:1,colour:rainColour(scale)}];
}
export function createRainGradient(scale,document){
  const ns='http://www.w3.org/2000/svg',defs=document.createElementNS(ns,'defs'),gradient=document.createElementNS(ns,'linearGradient');
  for(const [name,value]of Object.entries({id:'minute-rain-gradient',gradientUnits:'userSpaceOnUse',x1:0,x2:0,y1:85,y2:0}))gradient.setAttribute(name,value);
  for(const {offset,colour}of rainGradientStops(scale)){
    const stop=document.createElementNS(ns,'stop');stop.setAttribute('offset',offset);stop.setAttribute('stop-color',colour);gradient.append(stop);
  }
  defs.append(gradient);return defs;
}
