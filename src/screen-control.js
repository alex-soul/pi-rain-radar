import {createHelperClient} from './device-power.js';
export function validScreenCommand(input){
  if(!input||Object.keys(input).sort().join(',')!=='action,value')return false;
  if(input.action==='automatic_blanking')return typeof input.value==='boolean';
  return ['brightness','idle_timeout'].includes(input.action)&&Number.isFinite(input.value)&&input.value>=(input.action==='brightness'?10:1)&&input.value<=(input.action==='brightness'?100:120)&&(input.action!=='idle_timeout'||Number.isInteger(input.value));
}
export function screenState(value){
  if(value?.protocol!==1||!Number.isFinite(value.brightness)||value.brightness<0||value.brightness>100||!Number.isInteger(value.idle_timeout)||value.idle_timeout<1||value.idle_timeout>120||typeof value.automatic_blanking!=='boolean'||typeof value.persistence_ok!=='boolean')throw Error('Invalid helper response');
  return {state:'ready',brightness:value.brightness,idle_timeout:value.idle_timeout,automatic_blanking:value.automatic_blanking,persistence_ok:value.persistence_ok,persistence_pending:!!value.persistence_pending};
}
export function createScreenControl({socketPath=process.env.SCREEN_HELPER_SOCKET,tokenFile=process.env.SCREEN_HELPER_TOKEN_FILE,...options}={}){
  const call=createHelperClient({socketPath,tokenFile,...options});let busy=false;
  const unavailable=()=>({state:'unavailable',error:'Screen controls are unavailable. Check the local display controller and bridge.'});
  return {
    async status(){
      if(!socketPath&&!tokenFile)return {state:'unconfigured',error:'Screen controls have not been set up on this installation.'};
      if(!socketPath||!tokenFile)return unavailable();
      try{const result=await call('GET','/screen');return result.status===200?screenState(result):unavailable();}catch{return unavailable();}
    },
    async execute(input){
      if(!validScreenCommand(input))return {status:400,error:'Choose a valid screen setting.'};
      if(busy)return {status:409,error:'A screen setting is being applied. Please retry.'};
      if(!socketPath||!tokenFile)return {status:503,...unavailable()};
      busy=true;
      try{const result=await call('POST','/screen',JSON.stringify(input));if(result.status!==200)throw Error();return {status:200,...screenState(result)};}
      catch{return {status:503,...unavailable(),error:'Could not confirm the applied setting. Refresh Screen settings before retrying.'};}
      finally{busy=false;}
    },
  };
}
