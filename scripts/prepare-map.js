import {defaultSettings} from '../src/map.js';
import {prepareMapAssets} from '../src/map-assets.js';
await prepareMapAssets(defaultSettings,'public',{force:true,useBundled:false});
console.log('Regenerated both map views and place labels from bundled geography.');