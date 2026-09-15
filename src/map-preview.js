import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mapAnnotations} from './map-assets.js';

const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

// Preview is still an image: add the same projected annotations on the backend.
export async function renderMapPreview(settings,directory,dark) {
  const suffix=dark?'-dark':'';
  const [main,overview,places]=await Promise.all([
    readFile(join(directory,`basemap${suffix}.svg`),'utf8'),
    readFile(join(directory,`overview${suffix}.svg`),'utf8'),
    readFile(join(directory,'places.json'),'utf8').then(JSON.parse),
  ]);
  const ink=dark?'#e1eee7':'#284d47',halo=dark?'#1d2b29':'#ecf0e8';
  const {overviewRect:r}=mapAnnotations(settings);
  const textStyle=`fill="${ink}" stroke="${halo}" stroke-width="3" paint-order="stroke" font-family="Arial, sans-serif"`;
  const labels=places.map(p=>`<circle cx="${p.position[0]}" cy="${p.position[1]}" r="2" stroke="none"/><text x="${p.position[0]+7}" y="${p.position[1]+4}" font-size="13">${escape(p.name)}</text>`).join('');
  const centre=`<circle cx="640" cy="360" r="17" fill="${ink}" fill-opacity=".15" stroke="${ink}" stroke-opacity=".5"/><circle cx="640" cy="360" r="5" fill="${ink}"/>${settings.name?`<text x="640" y="402" text-anchor="middle" font-size="18" font-weight="bold">${escape(settings.name)}</text>`:''}`;
  return {
    main:main.replace('</svg>',`<g ${textStyle}>${labels}${centre}</g></svg>`),
    overview:overview.replace('</svg>',`<g fill="none" stroke="${ink}"><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" stroke-opacity=".5" stroke-dasharray="3 3"/><circle cx="195" cy="140" r="4" fill="${ink}" stroke-width="2"/></g></svg>`),
  };
}
