import {mapAnnotations,assetNames} from './map-assets.js';
import packageInfo from '../package.json' with {type:'json'};
import {mapAssetId} from './map.js';
export const escapeHtml = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const timeZones = [...new Set(['UTC','Europe/London',...Intl.supportedValuesOf('timeZone')])].sort();
export function mapPage(html,{settings,id}) {
  const {overviewRect:r,scale}=mapAnnotations(settings);
  if (!settings.name) {
    html=html.replace(' · {{LOCATION}}</title>','</title>')
      .replaceAll(' centred on {{LOCATION}}','')
      .replaceAll(' around {{LOCATION}}','')
      .replace(/<text[^>]*>{{LOCATION}}<\/text>/,'');
  }
  html=html.replaceAll('{{LOCATION}}',escapeHtml(settings.name)).replace('{{MAP_ID}}',id).replaceAll('{{APP_VERSION}}',escapeHtml(packageInfo.version));
  html=html.replace('{{LATITUDE}}',String(settings.lat)).replace('{{LONGITUDE}}',String(settings.lon));
  const assets=mapAssetId(settings);
  html=html.replace('{{MAP_ASSETS}}',assets).replaceAll('{{TIME_ZONE}}',escapeHtml(settings.timeZone||'Europe/London')).replace('{{TIME_ZONE_OPTIONS}}',timeZones.map(zone=>`<option value="${escapeHtml(zone)}"></option>`).join(''));
  for(const name of assetNames) html=html.replaceAll(`/${name}`,`/maps/${assets}/${name}`);
  html=html.replace(/<g id="overview-markers"[^>]*>[\s\S]*?<\/g>/,`<g id="overview-markers" fill="none" stroke="currentColor"><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" stroke-opacity="0.5" stroke-dasharray="3 3"/><circle cx="195" cy="140" r="4" fill="currentColor" stroke-width="2"/></g>`);
  html=html.replaceAll('{{SCALE_WIDTH}}',(scale.pixels+80).toFixed(2)).replace('{{SCALE_PATH}}',`M24 618v6h${scale.pixels.toFixed(2)}v-6`).replace('{{SCALE_X}}',(33+scale.pixels).toFixed(2)).replace('{{SCALE_LABEL}}',`${scale.km} km`);
  return html;
}
