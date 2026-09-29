// At most one retained-weather request for a selected window/revision/minute.
// Render calls while scrubbing reuse it; mode changes invalidate late results.
export function createTrendHistoryClient({fetchHistory,onReady,now=Date.now}){
  let key='',data=null,controller=null;
  return {
    read({map,end,hours,revision,mode,fallback}){
      if(!hours||!Number.isSafeInteger(end)){controller?.abort();key='';data=null;return fallback;}
      const next=JSON.stringify([map,end,hours,revision,mode,Math.floor(now()/60000)]);
      if(next!==key){
        controller?.abort();controller=new AbortController();const signal=controller.signal;key=next;data=null;
        Promise.resolve().then(()=>fetchHistory({map,end,hours,signal})).then(result=>{
          if(key===next){data=result;onReady();}
        }).catch(()=>{});
      }
      return data??fallback;
    },
  };
}
