let prefs={density:2,mainLabel:true,mainDot:true,overviewRect:true,overviewDot:true};
try{const v=JSON.parse(localStorage.getItem('radar-map-decoration'));for(const key of Object.keys(prefs)){if(key==='density'){if(Number.isInteger(v?.density)&&v.density>=0&&v.density<=5)prefs.density=v.density;}else if(typeof v?.[key]==='boolean')prefs[key]=v[key];}}catch{}
let baseline=[],candidates=[];
export function selectPlaces(base,extra,density){
  if(density===0)return [];
  if(density===2)return base;
  const selected=density>2?[...base]:[],gap=density===1?190:[0,0,125,100,80,60][density];
  for(const place of density>2?extra:base){const [x,y]=place.position;if(!selected.some(p=>p.name===place.name||Math.abs(p.position[0]-x)<gap&&Math.abs(p.position[1]-y)<gap*.36||Math.abs(p.position[1]-y)<20&&x<p.position[0]+[...p.name].length*7+16&&p.position[0]<x+[...place.name].length*7+16))selected.push(place);}
  return selected;
}
function paint(){
  for(const [selector,key]of [['.centre text','mainLabel'],['.centre circle','mainDot'],['#overview-markers rect','overviewRect'],['#overview-markers circle','overviewDot']])for(const node of document.querySelectorAll(selector))node.style.display=prefs[key]?'':'none';
  const credit=document.getElementById('town-credit');if(credit)credit.hidden=!(prefs.density>2&&candidates.length);
  const group=document.getElementById('places');group.replaceChildren();
  for(const place of selectPlaces(baseline,candidates,prefs.density)){
    const [x,y]=place.position;for(const [tag,attrs]of [['circle',{cx:x,cy:y,r:2}],['text',{x:x+7,y:y+4}]]){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);if(tag==='text')node.textContent=place.name;group.append(node);}
  }
}
export async function loadMapPlaces(identity){
  try{const response=await fetch(`/maps/${identity}/places.json`);if(response.ok)baseline=await response.json();}catch{}
  paint();
  try{const response=await fetch(`/maps/${identity}/places-candidates.json`);if(response.ok)candidates=await response.json();}catch{}
  paint();
}
export function setupMapDecoration(overview,main){
  const save=()=>{try{localStorage.setItem('radar-map-decoration',JSON.stringify(prefs));}catch{}paint();};
  for(const [host,key,title]of [[overview,'overviewRect','Main map outline'],[overview,'overviewDot','Centre dot'],[main,'mainLabel','Location label'],[main,'mainDot','Centre dot']]){
    const label=document.createElement('label');label.className='map-option';label.textContent=title;const input=document.createElement('input');input.type='checkbox';input.className='control-switch';input.setAttribute('role','switch');input.checked=prefs[key];input.onchange=()=>{prefs[key]=input.checked;save();};label.append(input);host.append(label);
  }
  const field=document.createElement('div');field.className='local-opacity';field.innerHTML='<label for="town-density">Town labels <output></output></label><input id="town-density" type="range" min="0" max="5" step="1">';main.append(field);
  const input=field.querySelector('input'),output=field.querySelector('output');const update=()=>{input.value=prefs.density;output.textContent=['None','Fewer','Default','More','Dense','Most'][prefs.density];};
  input.oninput=()=>{prefs.density=Number(input.value);save();update();};update();paint();
}
