export let shared=await fetch('/__review/state').then(r=>r.json());
export async function refresh(){
 shared=await fetch('/__review/state').then(r=>r.json());
 window.dispatchEvent(new Event('review-change'));window.dispatchEvent(new Event('radar-weather-preferences'));return shared;
}
export async function change(data){
 const r=await fetch('/__review/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const next=await r.json();if(!r.ok)throw Error(next.error);
 shared=next;window.dispatchEvent(new Event('review-change'));window.dispatchEvent(new Event('radar-weather-preferences'));return shared;
}
setInterval(async()=>{try{const next=await fetch('/__review/state').then(r=>r.json());if(next.revision!==shared.revision){shared=next;window.dispatchEvent(new Event('review-change'));window.dispatchEvent(new Event('radar-weather-preferences'));}}catch{}},2000);
