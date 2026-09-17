import { request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';

export function createDevicePower({socketPath=process.env.POWER_HELPER_SOCKET,tokenFile=process.env.POWER_HELPER_TOKEN_FILE,read=readFile,transport=httpRequest,now=Date.now,onEvent=()=>{}}={}) {
  let busy=false;
  const ids=new Map();
  async function call(method,path,body='',id=randomUUID()) {
    const token=(await read(tokenFile,'utf8')).trim();
    if(!/^[a-f0-9]{64}$/.test(token))throw Error('configuration');
    const time=String(Math.floor(now()/1000));
    const signature=createHmac('sha256',token).update([method,path,time,id,body].join('\n')).digest('hex');
    return new Promise((resolve,reject)=>{
      const req=transport({socketPath,path,method,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-Power-Time':time,'X-Power-Id':id,'X-Power-Signature':signature}},res=>{
        let result='';res.on('data',chunk=>{result+=chunk;if(result.length>2048)req.destroy(Error('response'));});
        res.on('end',()=>{try{resolve({...JSON.parse(result),status:res.statusCode});}catch{reject(Error('response'));}});
      });
      req.setTimeout(4000,()=>req.destroy(Error('timeout')));req.on('error',reject);req.end(body);
    });
  }
  return {
    async status(){
      if(!socketPath&&!tokenFile)return {state:'unconfigured'};
      if(!socketPath||!tokenFile)return {state:'unavailable',error:'Device Power configuration is incomplete. Check the setup guide.'};
      try{
        const result=await call('GET','/status');
        if(result.status!==200||result.protocol!==1)return {state:'unavailable',error:'Cannot authenticate with a compatible power helper. Check the setup guide.'};
        return {state:result.pending?'pending':'ready',version:result.version};
      }catch{return {state:'unavailable',error:'Cannot reach the power helper. Check its service and connection.'};}
    },
    async execute(input){
      if(!input||!['restart','shutdown'].includes(input.action)||typeof input.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(input.requestId)||Object.keys(input).some(k=>!['action','requestId'].includes(k)))return {status:400,error:'Choose Restart or Shutdown and confirm again.'};
      for(const [id,at]of ids)if(now()-at>300000)ids.delete(id);
      if(busy||ids.has(input.requestId))return {status:409,error:'A power request is already being handled. Do not submit it again.'};
      busy=true;
      try{
        const state=await this.status();if(state.state!=='ready')return {status:503,error:state.error||'Device Power is not ready. Check the setup guide.'};
        ids.set(input.requestId,now());if(ids.size>128)ids.delete(ids.keys().next().value);
        const result=await call('POST','/power',JSON.stringify({action:input.action}),input.requestId);
        if(result.status!==202){onEvent('power-error');return {status:result.status===409?409:503,error:result.status===409?'A recent power request is already being handled.':'The helper could not start the power action. Check the device and its service log.'};}
        onEvent(input.action==='restart'?'power-restart':'power-shutdown');return {status:202,accepted:true,action:input.action};
      }catch{onEvent('power-error');return {status:503,error:'Could not confirm the power request. Check the device before trying again.'};}
      finally{busy=false;}
    },
  };
}
