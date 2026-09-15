import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const revision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const names = ['ne_10m_admin_0_countries','ne_10m_roads','ne_10m_populated_places'];
const datasets = await Promise.all(names.map(async name => {
  const response = await fetch(`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/${name}.geojson`, {signal:AbortSignal.timeout(120000)});
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return (await response.json()).features;
}));
const [countries, roads, places] = datasets;
const data = {revision,
  land:countries.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates),
  roads:roads.flatMap(f=>f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates),
  places:places.map(f=>({name:f.properties.NAME,population:f.properties.POP_MAX,coordinates:f.geometry.coordinates}))};
await mkdir('assets',{recursive:true});
const bytes = gzipSync(JSON.stringify(data),{level:9});
await writeFile('assets/geography.json.gz',bytes);
console.log(`Bundled pinned public-domain geography: ${bytes.length} bytes.`);
