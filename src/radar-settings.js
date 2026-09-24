import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export async function createRadarSettings(directory, { onEvent = () => {} } = {}) {
  const folder = join(directory, 'settings');
  const file = join(folder, 'radar.json');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  let waitForSettle = true, busy = false, main = 'rainviewer', overview = 'same', monthlyLimit = null, apply = null, pendingLimit, pendingWait;
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (typeof saved.waitForSettle !== 'boolean') throw new Error();
    waitForSettle = saved.waitForSettle;
    main=saved.main??main;overview=saved.overview??overview;monthlyLimit=saved.monthlyLimit??null;
    if(!['disabled','rainviewer','rainbow'].includes(main)||!['same','disabled','rainviewer','rainbow'].includes(overview)||!(monthlyLimit===null||Number.isSafeInteger(monthlyLimit)&&monthlyLimit>=1&&monthlyLimit<=10000000))throw new Error();
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Stored radar settings are invalid. Restore settings/radar.json before starting.');
  }
  return {
    current: () => ({ waitForSettle, main, overview, monthlyLimit }),
    setApply: callback => {apply=callback;},
    waitForSettle: () => pendingWait ?? waitForSettle,
    requestLimit:()=>pendingLimit===undefined?monthlyLimit:monthlyLimit===null?pendingLimit:pendingLimit===null?monthlyLimit:Math.min(monthlyLimit,pendingLimit),
    async configure(input) {
      if (typeof input?.waitForSettle !== 'boolean') return { status: 400, error: 'Choose whether to wait for radar to settle.' };
      const next={waitForSettle:input.waitForSettle,main:input.main??main,overview:input.overview??overview,monthlyLimit:Object.hasOwn(input,'monthlyLimit')?input.monthlyLimit:monthlyLimit};
      if(!['disabled','rainviewer','rainbow'].includes(next.main)||!['same','disabled','rainviewer','rainbow'].includes(next.overview)||!(next.monthlyLimit===null||Number.isSafeInteger(next.monthlyLimit)&&next.monthlyLimit>=1&&next.monthlyLimit<=10000000))return {status:400,error:'Check the radar sources and monthly tile limit.'};
      if (busy) return { status: 409, error: 'Radar settings are being saved. Please try again.' };
      busy = true;
      pendingLimit=next.monthlyLimit;
      pendingWait=next.waitForSettle;
      try {
        const commit=async()=>{
          await writeFile(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
          await rename(`${file}.tmp`, file);
          const changed=waitForSettle!==next.waitForSettle;
          ({waitForSettle,main,overview,monthlyLimit}=next);
          if(changed)onEvent(waitForSettle?'settling-on':'settling-off');
        };
        if(main!==next.main||overview!==next.overview){
          if(!apply)return {status:503,error:'Source switching is unavailable.'};
          const result=await apply(next,commit);if(result.status!==200)return result;
        }else await commit();
        return { status: 200, ...next };
      } finally { busy = false; pendingLimit=undefined; pendingWait=undefined; }
    },
  };
}
