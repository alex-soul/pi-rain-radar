import {mkdir,readFile,writeFile,rename,copyFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {defaultSettings,legacyDefaultSettings,makeViews,validateMapSettings,hash,mapAssetId} from './map.js';
import {prepareMapAssets,assetNames} from './map-assets.js';
import {renderMapPreview} from './map-preview.js';
import {createRadar} from './radar.js';

export const mapId = settings => !settings.timeZone || settings.timeZone===defaultSettings.timeZone ? mapAssetId(settings) : hash({version:1,settings});
export async function createMapSettings(directory,{prepare=prepareMapAssets,radarFactory=createRadar,nextRefreshAt,waitForSettle,onEvent,onChange=async()=>{}}={}) {
  const settingsFile=join(directory,'settings','map.json');
  await mkdir(join(directory,'settings'),{recursive:true,mode:0o700});
  let settings=defaultSettings;
  try { settings=validateMapSettings(JSON.parse(await readFile(settingsFile,'utf8'))); }
  catch(error) {
    if(error.code!=='ENOENT') throw new Error('Stored map settings are invalid. Restore settings/map.json before starting.');
    // Old installations used implicit defaults. Preserve them and their cache namespace.
    for (const marker of ['history.json','settling.json',join('maps',mapAssetId(legacyDefaultSettings))]) {
      try { await access(join(directory,marker)); settings=legacyDefaultSettings; break; }
      catch(e) { if(e.code!=='ENOENT') throw e; }
    }
    await writeFile(`${settingsFile}.tmp`,JSON.stringify(settings),{mode:0o600});
    await rename(`${settingsFile}.tmp`,settingsFile);
  }
  let busy=false,error=null,applying=false,candidateRadar=null;
  const previewDirectory=join(directory,'map-preview');
  let previewAsset=null;
  const makeRadar = value => {
    const views=makeViews(value);
    const original=makeViews(legacyDefaultSettings);
    const storageKey=hash(views)===hash(original)?'':hash(views);
    return radarFactory(directory,undefined,{views,storageKey,nextRefreshAt,waitForSettle,onEvent});
  };
  await prepare(settings,join(directory,'maps',mapAssetId(settings)));
  let radar=await makeRadar(settings);
  async function apply(value) {
    let published=false;
    try {
      if (mapAssetId(value)!==mapAssetId(settings)) {
        const target=join(directory,'maps',mapAssetId(value));
        if(previewAsset===mapAssetId(value)) {
          await mkdir(target,{recursive:true});
          for(const name of [...assetNames,'ready.json']) await copyFile(join(previewDirectory,name),join(target,name));
        } else await prepare(value,target);
      }
      const sameViews=hash(makeViews(value))===hash(makeViews(settings));
      const candidate=sameViews?radar:await makeRadar(value);
      if(!sameViews) {
        candidateRadar=candidate;
        await candidate.refresh();
        if(!candidate.status().frames.length) throw new Error('No complete radar frames for the new view. Existing map kept; try again later.');
      }
      await writeFile(`${settingsFile}.tmp`,JSON.stringify(value),{mode:0o600});
      await rename(`${settingsFile}.tmp`,settingsFile);
      settings=value;radar=candidate;
      published=true;
      await onChange(value);
    } catch(e) { error=published?'Map applied; weather update is unavailable.':e.message.startsWith('No complete radar')?e.message:'Map preparation failed. Existing map kept; try again.'; }
    finally { busy=false;applying=false;candidateRadar=null; }
  }
  return {
    current:()=>({settings,radar,id:mapId(settings)}),
    status:()=>({busy,error,applying,progress:applying?candidateRadar?.status().progress??null:null}),
    async preview(input) {
      if(busy) return {status:409,error:'A map update or preview is already running.'};
      let value;
      try { value=validateMapSettings(input); } catch(e) { return {status:400,error:e.message}; }
      busy=true;
      try {
        const id=mapAssetId(value);
        let folder=join(directory,'maps',mapAssetId(settings));
        if(id!==mapAssetId(settings)) {
          folder=previewDirectory;
          if(previewAsset!==id) {
            previewAsset=null;
            await prepare(value,folder,{force:true});
            previewAsset=id;
          }
        }
        return {status:200,...await renderMapPreview(value,folder,input.theme==='dark')};
      } catch { return {status:503,error:'Preview unavailable. Your current map is unchanged.'}; }
      finally { busy=false; }
    },
    configure(input) {
      if(busy) return {status:409,error:'A map update is already running.'};
      if(radar.status().fetching)return {status:409,error:'Wait for the current radar update before changing the map.'};
      let value;
      try { value=validateMapSettings(input); } catch(e) { return {status:400,error:e.message}; }
      if(mapId(value)===mapId(settings)) { error=null; return {status:200,message:'Map already up to date.'}; }
      busy=true;error=null;applying=true;void apply(value);
      return {status:202,message:'Preparing map…'};
    },
  };
}
