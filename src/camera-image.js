import {fork} from 'node:child_process';
import {CameraError} from './camera-http.js';

export function decodeCameraImage(bytes,receivedAt,{signal,preview=false}={}){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8*1024*1024)return Promise.reject(new CameraError('CAMERA_IMAGE'));
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new CameraError('CAMERA_CANCELLED'));
    const child=fork(new URL('./camera-image-worker.js',import.meta.url),[],{serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,execArgv:['--max-old-space-size=96']});
    let done=false;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);child.kill();error?reject(new CameraError(error)):resolve(result);};
    const cancel=()=>finish('CAMERA_CANCELLED'),timer=setTimeout(()=>finish('CAMERA_DECODE_TIMEOUT'),8000);
    signal?.addEventListener('abort',cancel,{once:true});
    child.on('error',()=>finish('CAMERA_IMAGE'));child.on('exit',()=>finish('CAMERA_IMAGE'));
    child.on('message',result=>finish(result.ok?null:'CAMERA_IMAGE',result));
    child.send({bytes,receivedAt,preview},error=>{if(error)finish('CAMERA_IMAGE');});
  });
}
