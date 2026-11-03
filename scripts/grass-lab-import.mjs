import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {buildRecordedLab} from '../src/grass-lab-data.js';
export {buildRecordedLab,importTracker,trackerTime} from '../src/grass-lab-data.js';

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [historyFile,trackerFile,output]=process.argv.slice(2);
 if(!historyFile||!trackerFile||!output)throw Error('Usage: node scripts/grass-lab-import.mjs history.json tracker.json output.json[.gz]');
 const read=async file=>JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
 const data=buildRecordedLab(await read(historyFile),await read(trackerFile));
 const json=JSON.stringify(data);await writeFile(output,output.endsWith('.gz')?gzipSync(json):json,{flag:'wx'});
 console.log(JSON.stringify({samples:data.samples.length,observations:data.observations.length,markers:data.markers.length,validation:data.validation,bytes:Buffer.byteLength(json)}));
}
