// This browser's observations only; no attempt to upload events to an offline appliance.
let previous = true;
const events=[];
export function recordConnection(reachable, now=Date.now()) {
  if (reachable===previous) return;
  previous=reachable;
  const time=new Date(now).toISOString();
  events.push({source:'This browser',severity:reachable?'info':'error',message:reachable?'Connection to the appliance restored.':'Cannot reach the appliance. Available cached playback may continue.',time,lastAt:time,count:1});
  if(events.length>25)events.shift();
}
export const connectionEvents=()=>events.map(event=>({...event}));
