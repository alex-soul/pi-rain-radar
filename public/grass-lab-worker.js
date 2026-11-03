import {replayGrass} from './grass-replay.js';
let samples=[],initialState=null,recorded=[];
self.onmessage=event=>{
 const {id,parameters,data}=event.data;
 try{
   if(data){samples=data.samples;initialState=data.initialState;recorded=data.recorded;}
   const started=performance.now(),points=replayGrass(samples,parameters,initialState);
   let validation=null;
   if(parameters===null){let compared=0,mismatches=0,maxMoistureError=0;
     for(let i=0;i<recorded.length;i++){const old=recorded[i],next=points[i];if(old.hasEstimate===false)continue;compared++;
       const error=Number.isFinite(old.moisture)&&Number.isFinite(next.moisture)?Math.abs(old.moisture-next.moisture):0;
       maxMoistureError=Math.max(maxMoistureError,error);
       if(error>1e-10||old.value!==next.value&&!(Number.isFinite(old.value)&&Number.isFinite(next.value)&&Math.abs(old.value-next.value)<1e-10))mismatches++;
     }validation={compared,mismatches,maxMoistureError};
   }
   self.postMessage({id,validation,ms:performance.now()-started,points:points.map(({time,value,moisture,reason})=>({time,value,moisture,reason}))});
 }catch(error){self.postMessage({id,error:error.message});}
};
