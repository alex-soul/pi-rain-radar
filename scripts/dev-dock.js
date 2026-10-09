import {readingNames,defaultReadings,dockOutline,temperatureText,windText,windDirectionText,visibilityText,pressureText} from '/weather-format.js';
import {dockText} from '/dock-format.js';
const $=id=>document.getElementById(id),ids=Object.keys(readingNames);
const samples=Array.from({length:289},(_,i)=>{
  const p=i/288,temperature=-4+22*Math.sin(p*Math.PI)**2;
  return {temperature,feels:temperature-3-3*Math.sin(i/11),dew:temperature-2-8*Math.abs(Math.sin(i/21)),wind:Math.max(0,12+13*Math.sin(i/19)),gust:Math.max(0,25+24*Math.sin(i/17)),humidity:Math.round(50+50*Math.cos(i/43)**2),direction:(i*17)%360,visibility:Math.round(80+11000*Math.abs(Math.sin(i/29))),pressure:998+24*Math.sin(p*Math.PI*2),uv:Math.max(0,11*Math.sin((p-.25)*Math.PI*2)),sun:p,moon:p};
});
// Deliberate digit/sign boundaries across the day, beyond ordinary smooth readings.
for(let i=0;i<samples.length;i+=24)Object.assign(samples[i],{temperature:[-.1,0,9.9,10,-10.1,29.9,30][(i/24)%7],wind:[0,9,10,99,100][(i/24)%5],gust:[9,10,99,100][(i/24)%4],humidity:[9,10,99,100][(i/24)%4],visibility:[0,990,9990,10000][(i/24)%4],pressure:i%48?999:1000,uv:i%48?9.9:10});
const config={gap:5,iconGap:3,directionFont:24,padX:68,padY:8,rowGap:10,font:24,fontScale:100,icon:26,trend:9,trendGap:2,extra:0,width:1280,alignment:'right',visible:[...ids],slots:{}};
try{Object.assign(config,JSON.parse(localStorage.getItem('radar-dock-playground')||'{}'));}catch{}
delete config.directionGap;
config.order=[...new Set([...(Array.isArray(config.order)?config.order:ids),...ids])].filter(id=>ids.includes(id));
let dock,playing=null,frame=0,previousPositions=null,maxShift=0;
function text(id,s,i){
  if(['temperature','feels','dew'].includes(id))return temperatureText(s[id]);
  if(['wind','gust'].includes(id))return windText(s[id]);
  if(id==='humidity')return s[id]+'%';
  if(id==='direction')return windDirectionText(s.direction,$('direction').value);
  if(id==='depression')return (s.temperature-s.dew).toFixed(1)+'°';
  if(id==='visibility')return dockText({id,value:s.visibility,text:visibilityText(s.visibility),unit:'km'});
  if(id==='pressure')return pressureText(s.pressure);
  if(id==='uv')return dockText({id,value:s.uv,text:String(s.uv),unit:'index'});
  if($('astro').value==='position')return `${Math.round(45*Math.sin(i/46))}° ${windDirectionText(i*3,'compass')}`;
  return `${i<84?'↑':'↓'} ${id==='sun'?(i<84?'07:00':'18:25'):(i<140?'11:40':'22:05')}`;
}
function widestText(id){
  const fixed={temperature:'-88.8°',feels:'-88.8°',dew:'-88.8°',wind:'999',gust:'999',humidity:'100%',depression:'88.8°',visibility:'10.0+',pressure:'1088',uv:'99.9'};
  if(id in fixed)return fixed[id];
  if(id==='direction')return $('direction').value==='degrees'?'359°':'WNW';
  return $('astro').value==='position'?'-88° WNW':'↓ 23:59';
}
function save(){const selected={...config,layout:$('layout').value,direction:$('direction').value,astronomy:$('astro').value,widest:$('widest').checked};localStorage.setItem('radar-dock-playground',JSON.stringify(selected));$('settings').value=JSON.stringify(selected,null,2);}
const measure=document.createElement('span');measure.className='measure';document.body.append(measure);
function widths(only=null){for(const id of ids){if(only&&id!==only)continue;measure.style.fontSize=(id==='direction'?config.directionFont:config.font)+'px';const widest=Math.max(...samples.map((s,i)=>{measure.textContent=text(id,s,i);return measure.getBoundingClientRect().width;}));config.slots[id]=Math.ceil(widest);}}
function controls(){
  const specs=[['gap','Between readings',0,40],['iconGap','Icon → value gap',0,20],['directionFont','Wind / Sun / Moon direction font at 100%',10,36],['padX','Side padding',0,90],['padY','Vertical padding',0,24],['rowGap','Between wrapped rows',0,30],['font','Base font size at 100%',14,32],['fontScale','User font size',75,150],['icon','Icon size',16,36],['trend','Trend arrow width',0,18],['trendGap','Trend → icon gap',0,12],['extra','Extra width per value slot',0,30],['width','Preview width',320,1600]];
  for(const [key,label,min,max]of specs){const row=document.createElement('div');row.className='slider-row';row.innerHTML=`<label for="tune-${key}">${label}<output id="out-${key}"></output></label><input id="tune-${key}" type="range" min="${min}" max="${max}" value="${config[key]}">`;$('sliders').append(row);if(key==='fontScale')row.querySelector('input').step=5;row.querySelector('input').oninput=e=>{config[key]=Number(e.target.value);previousPositions=null;maxShift=0;render();};}
  const label=document.createElement('label');label.textContent='Value alignment ';const select=document.createElement('select');for(const v of ['right','left','center'])select.add(new Option(v,v));select.value=config.alignment;select.onchange=()=>{config.alignment=select.value;render();};label.append(select);$('sliders').append(label);
  readingControls();
}
function readingControls(){ $('reading-controls').replaceChildren();for(const id of config.order){const row=document.createElement('div');row.className='reading-row';row.innerHTML=`<label><input type="checkbox" ${config.visible.includes(id)?'checked':''}>${readingNames[id]}</label><input type="range" min="12" max="220" value="${config.slots[id]}" aria-label="${readingNames[id]} value width"><output></output><span class="order-buttons"><button type="button" aria-label="Move ${readingNames[id]} earlier">↑</button><button type="button" aria-label="Move ${readingNames[id]} later">↓</button></span>`;row.querySelector('[type=checkbox]').onchange=e=>{config.visible=e.target.checked?ids.filter(key=>key===id||config.visible.includes(key)):config.visible.filter(key=>key!==id);previousPositions=null;maxShift=0;render();};row.querySelector('[type=range]').oninput=e=>{config.slots[id]=Number(e.target.value);previousPositions=null;maxShift=0;render();};for(const [index,button]of [...row.querySelectorAll('button')].entries()){const from=config.order.indexOf(id),to=from+(index?1:-1);button.disabled=to<0||to>=config.order.length;button.onclick=()=>{[config.order[from],config.order[to]]=[config.order[to],config.order[from]];previousPositions=null;maxShift=0;readingControls();render();};}row.dataset.reading=id;$('reading-controls').append(row);}}
function render(){
  const tuned=$('layout').value==='tuned';dock.classList.toggle('tuned',tuned);dock.classList.toggle('show-bounds',$('bounds').checked);document.documentElement.dataset.theme=$('theme').value;
  dock.classList.toggle('astro-position',$('astro').value==='position');
  for(const id of config.order)dock.querySelector('.weather-readings').append($('weather-'+id).closest('.weather-reading'));
  for(const [css,key]of Object.entries({'item-gap':'gap','icon-gap':'iconGap','pad-x':'padX','pad-y':'padY','row-gap':'rowGap','reading-font':'font','icon-size':'icon','trend-width':'trend','trend-gap':'trendGap'}))dock.style.setProperty('--'+css,config[key]+'px');dock.style.setProperty('--alignment',config.alignment);dock.style.setProperty('--reading-font',config.font*config.fontScale/100+'px');dock.style.setProperty('--direction-font',config.directionFont*config.fontScale/100+'px');dock.style.setProperty('--astro-font',config.icon*config.fontScale/100+'px');
  $('preview').style.width=config.width+'px';dock.style.setProperty('--preview-width',config.width+'px');
  for(const id of ids){const value=$('weather-'+id),row=value.closest('.weather-reading'),slot=value.closest('.reading-value-slot');row.hidden=!config.visible.includes(id);row.title=readingNames[id];row.setAttribute('aria-label',readingNames[id]);slot.style.setProperty('--slot',(tuned?(config.slots[id]+config.extra)*config.fontScale/100:config.slots[id]+config.extra)+(!tuned&&!['direction','sun','moon'].includes(id)?config.trend+config.trendGap:0)+'px');value.textContent=$('widest').checked?widestText(id):text(id,samples[frame],frame);const marker=row.querySelector('.reading-trend');if(marker){if(tuned)row.prepend(marker);else slot.append(marker);}if(marker)marker.textContent=$('widest').checked?'↑':frame%5===0?'':frame%3===0?'↓':'↑';}
  $('weather-direction-arrow').setAttribute('visibility','visible');$('weather-direction-arrow').setAttribute('transform',`rotate(${(samples[frame].direction+180)%360} 14 14)`);
  const rect=dock.getBoundingClientRect(),height=dock.querySelector('.weather-details').getBoundingClientRect().height+18;dock.querySelector('.weather-shape').setAttribute('viewBox',`0 0 ${rect.width} ${height}`);dock.querySelector('.weather-shape').style.height=height+'px';$('weather-outline').setAttribute('d',dockOutline(rect.width,height));$('preview').style.minHeight=Math.max(140,height+30)+'px';
  const positions=config.order.filter(id=>config.visible.includes(id)).map(id=>{const r=$('weather-'+id).closest('.weather-reading').getBoundingClientRect();return {id,x:r.x-rect.x,y:r.y-rect.y};});if(previousPositions&&previousPositions.length===positions.length){for(let i=0;i<positions.length;i++)if(positions[i].id===previousPositions[i].id)maxShift=Math.max(maxShift,Math.abs(positions[i].x-previousPositions[i].x),Math.abs(positions[i].y-previousPositions[i].y));}previousPositions=positions;
  const clipped=config.visible.filter(id=>{const n=$('weather-'+id);return n.scrollWidth>n.clientWidth+1;});$('fit').textContent=`Dock ${Math.round(rect.width)} × ${Math.round(height)} px · maximum reading-position movement while scrubbing: ${maxShift.toFixed(1)} px${clipped.length?' · Value exceeds slot: '+clipped.map(id=>readingNames[id]).join(', '):''}`;
  $('stamp').textContent=`Day ${frame===288?2:1} · ${String(Math.floor(frame*5/60)%24).padStart(2,'0')}:${String(frame*5%60).padStart(2,'0')} · sample ${frame+1}/289`;
  for(const [key,value]of Object.entries(config))if($('out-'+key))$('out-'+key).textContent=key==='fontScale'?value+'%'+(value===100?' (default)':'')+' · '+(config.font*value/100).toFixed(1)+' px':value+' px';for(const row of $('reading-controls').children){row.querySelector('output').textContent=config.slots[row.dataset.reading]+' px';row.querySelector('[type=range]').value=config.slots[row.dataset.reading];}document.documentElement.style.setProperty('--sticky-height',$('sticky-preview').getBoundingClientRect().height+'px');save();
}
function stop(){clearInterval(playing);playing=null;$('play').textContent='Play';}
function play(){stop();$('play').textContent='Pause';playing=setInterval(()=>{frame=(frame+1)%289;$('scrub').value=frame;render();},Number($('speed').value));}
try{
  const html=await (await fetch('/')).text(),parsed=new DOMParser().parseFromString(html,'text/html');dock=parsed.getElementById('weather-dock');$('dock-host').append(dock);
  for(const id of ids){const value=$('weather-'+id),slot=document.createElement('span'),marker=document.createElement('span');slot.className='reading-value-slot';slot.dataset.reading=id;marker.className='reading-trend';marker.setAttribute('aria-hidden','true');value.before(slot);slot.append(value,marker);if(['sun','moon'].includes(id))marker.remove();}
  for(const [id,key]of [['layout','layout'],['direction','direction'],['astro','astronomy']])if(config[key])$(''+id).value=config[key];
  $('widest').checked=!!config.widest;
  if(!Object.keys(config.slots).length)widths();controls();render();
  $('scrub').oninput=e=>{frame=Number(e.target.value);render();};$('play').onclick=()=>playing?stop():play();$('speed').onchange=()=>{if(playing)play();};
  for(const id of ['layout','theme','bounds','direction','astro','widest'])$(id).onchange=()=>{previousPositions=null;maxShift=0;render();};
  $('all').onclick=()=>{config.visible=[...ids];previousPositions=null;maxShift=0;readingControls();render();};$('defaults').onclick=()=>{config.visible=[...defaultReadings];previousPositions=null;maxShift=0;readingControls();render();};
  $('export').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([$('settings').value],{type:'application/json'}));a.href=url;a.download='top-dock-spacing.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}catch(e){$('error').textContent='Preview could not load: '+e.message;}
