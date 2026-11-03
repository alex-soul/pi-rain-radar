import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
import {buildRecordedLab} from './grass-lab-data.js';
const compress=promisify(gzip);
export function grassLabRoutes({store,auth,context,version,timeZone='Europe/London',now=Date.now}){
 let cache=null,pending=null,revision=0;
 const dataset=async()=>{
   const location=context(),zone=typeof timeZone==='function'?timeZone():timeZone,key=JSON.stringify([location,zone,revision]);
   if(cache?.key===key&&now()-cache.at<30000)return cache;
   if(pending?.key===key)return pending.promise;
   const promise=(async()=>{
     const history=await store.grassData(location);history.appVersion=version;
     const data=history.presentations.length?buildRecordedLab(history,{values:[],timeZone:zone},{verify:false}):{samples:[],recorded:[],parameters:null};
     Object.assign(data,{synthetic:false,timeZone:zone,observations:history.observations,markers:history.markers,capturedAt:history.capturedAt,retentionDays:30});
     const body=JSON.stringify(data);cache={key,at:now(),body,gzip:await compress(body)};return cache;
   })();pending={key,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
 };
 return async(req,res,path)=>{
   const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
   try{
     if(path==='/api/grass-lab/data'&&req.method==='GET'){
       const data=await dataset(),zip=/\bgzip\b/.test(req.headers['accept-encoding']??'');
       res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Accept-Encoding',...(zip?{'Content-Encoding':'gzip'}:{})});res.end(zip?data.gzip:data.body);return;
     }
     if(path==='/api/grass-lab/observations'&&req.method==='POST'){
       if(req.headers['content-type']!=='application/json'||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(403,{error:'Use the observation page on this installation.'});
       if(!await auth.authorized(req.headers.authorization?.replace(/^Bearer /,'')))return send(401,{error:'Unlock with the installation PIN to save.'});
       let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)return send(413,{error:'Observation too large.'});body+=chunk;}
       let input;try{input=JSON.parse(body);}catch{return send(400,{error:'Invalid observation.'});}
       try{const saved=await store.grassObserve(context(),input);revision++;cache=null;return send(201,saved);}catch(e){return send(400,{error:e.message});}
     }
     return send(404,{error:'Unknown Grass Lab route.'});
   }catch{return send(503,{error:'Grass history is temporarily unavailable. Your observations are preserved.'});}
 };
}
