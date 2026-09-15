import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Worker,workerData,parentPort,isMainThread} from 'node:worker_threads';
import {join} from 'node:path';
import {defaultSettings,makeViews,world} from './map.js';

export const assetNames = ['basemap.svg','basemap-dark.svg','overview.svg','overview-dark.svg','places.json'];
export function mapAnnotations(settings) {
  const {view,overviewView} = makeViews(settings);
  const ratio = 2 ** (overviewView.zoom-view.zoom);
  const width = view.width*ratio, height=view.height*ratio;
  const kmPerPixel = 40075.016686 * Math.cos(view.lat*Math.PI/180) / (256*2**view.zoom);
  const limit=134*kmPerPixel*1.01;
  const power=10**Math.floor(Math.log10(limit));
  const km=[1,2,5,10].map(n=>n*power).filter(n=>n<=limit).at(-1);
  return {overviewRect:{x:(390-width)/2,y:(280-height)/2,width,height},scale:{km,pixels:km/kmPerPixel}};
}
function projected(points,target) {
  const size=256*2**target.zoom, [cx,cy]=world(target.lon,target.lat,target.zoom);
  let previous;
  const line=points.map(([lon,lat])=>{
    let [x,y]=world(lon,lat,target.zoom);
    if(previous!==undefined) x+=Math.round((previous-x)/size)*size;
    previous=x;
    return [x-cx+target.width/2,y-cy+target.height/2];
  });
  return line;
}
function bounds(lines) {
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const line of lines) for(const [x,y] of line) {left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  return {left,right,top,bottom};
}
function paths(rings,target,closed) {
  const lines=rings.map(r=>projected(r,target));
  const b=bounds(lines),size=256*2**target.zoom;
  if(b.bottom<0 || b.top>target.height) return '';
  const centreShift=Math.round((target.width/2-(b.left+b.right)/2)/size);
  let output='';
  for(let shift=centreShift-1;shift<=centreShift+1;shift++) {
    const offset=shift*size;
    if(b.right+offset<0 || b.left+offset>target.width) continue;
    const d=lines.map(line=>line.map(([x,y],i)=>`${i?'L':'M'}${(x+offset).toFixed(1)},${y.toFixed(1)}`).join('')+(closed?'Z':'')).join('');
    output+=`<path d="${d}"/>`;
  }
  return output;
}
async function render(settings,directory,useBundled=true) {
  await mkdir(directory,{recursive:true});
  if(useBundled && JSON.stringify(makeViews(settings))===JSON.stringify(makeViews(defaultSettings))) {
    // Preserve the approved Coventry appearance byte-for-byte on initial setup.
    for(const name of assetNames) await writeFile(join(directory,name),await readFile(new URL(`../public/${name}`,import.meta.url)));
  } else {
    const geography=JSON.parse(gunzipSync(await readFile(new URL('../assets/geography.json.gz',import.meta.url))));
    const views=makeViews(settings);
    for(const [prefix,target] of [['basemap',views.view],['overview',views.overviewView]]) {
      const land=geography.land.map(rings=>paths(rings,target,true)).join('');
      const roads=prefix==='basemap'?geography.roads.map(line=>paths([line],target,false)).join(''):'';
      for(const dark of [false,true]) {
        const sea=dark?'#111d26':'#d7e8ed',ground=dark?'#1d2b29':'#ecf0e8',border=dark?'#3c5550':'#b8cdc7',road=dark?'#31423d':'#d0d6c9';
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${target.width}" height="${target.height}" viewBox="0 0 ${target.width} ${target.height}"><rect width="100%" height="100%" fill="${sea}"/><g fill="${ground}" stroke="${border}" stroke-width="1" fill-rule="evenodd">${land}</g><g fill="none" stroke="${road}" stroke-width="1.4" stroke-linejoin="round">${roads}</g></svg>`;
        await writeFile(join(directory,`${prefix}${dark?'-dark':''}.svg`),svg);
      }
    }
    const selected=[];
    for(const city of geography.places.sort((a,b)=>b.population-a.population)) {
      const position=projected([city.coordinates],views.view)[0];
      const size=256*2**views.view.zoom;
      position[0]+=Math.round((640-position[0])/size)*size;
      const [x,y]=position;
      if(x<50||x>1230||y<35||y>610||Math.hypot(x-640,y-360)<65) continue;
      if(selected.some(p=>Math.abs(p.position[0]-x)<125&&Math.abs(p.position[1]-y)<45)) continue;
      selected.push({name:city.name,position});
    }
    await writeFile(join(directory,'places.json'),JSON.stringify(selected));
  }
  await writeFile(join(directory,'ready.json'),JSON.stringify({settings}));
}
export async function prepareMapAssets(settings,directory,{force=false,useBundled=true}={}) {
  if(!force) try { await Promise.all([...assetNames,'ready.json'].map(name=>access(join(directory,name)))); return; } catch {}
  // Geometry preparation is one-off work; keep it off the HTTP/playback thread.
  await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:{settings,directory,useBundled}});
    worker.once('error',reject);
    worker.once('exit',code=>code===0?resolve():reject(new Error('Map preparation failed')));
  });
}
if(!isMainThread && workerData) {
  await render(workerData.settings,workerData.directory,workerData.useBundled);
  parentPort.close();
}
