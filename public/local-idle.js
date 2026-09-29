export const UI_IDLE_MS=15000;
export const AFFORDANCE_IDLE_MS=1000;
// Each caller owns an independent timer; an open editor or gesture holds it.
export function createLocalIdle({show,hide,held=()=>false,setTimer=setTimeout,clearTimer=clearTimeout,delayMs=UI_IDLE_MS}) {
  let timer;
  const cancel=()=>{clearTimer(timer);timer=undefined;};
  const schedule=()=>{cancel();if(!held())timer=setTimer(()=>{timer=undefined;if(!held())hide();},delayMs);};
  return {activity(){show();schedule();},schedule,cancel,reset(){cancel();hide();}};
}
