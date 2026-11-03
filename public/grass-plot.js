// Preserve extrema and real gaps while bounding the number of SVG vertices.
export function plotPoints(points,start,end,width){
 const result=[],buckets=Math.max(1,Math.floor(width)),span=Math.max(1,end-start);
 let group=[],last=null,bucket=null,breakBefore=true;
 const flush=()=>{if(!group.length)return;const min=group.reduce((a,b)=>a.value<b.value?a:b),max=group.reduce((a,b)=>a.value>b.value?a:b);
   const kept=[...new Set([group[0],min,max,group.at(-1)])].sort((a,b)=>a.time-b.time);
   for(const point of kept){result.push({...point,breakBefore});breakBefore=false;}group=[];
 };
 for(const point of points){
   if(!Number.isFinite(point.value)||last&&point.time-last.time>600000){flush();breakBefore=true;bucket=null;}
   if(!Number.isFinite(point.value)){last=null;continue;}
   const next=Math.max(-1,Math.min(buckets,Math.floor((point.time-start)/span*buckets)));
   if(next!==bucket){flush();bucket=next;}
   group.push(point);last=point;
 }flush();return result;
}
