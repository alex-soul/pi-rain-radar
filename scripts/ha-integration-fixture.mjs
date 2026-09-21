// Explicitly started synthetic LAN fixture for production-transport UI checks.
// It never contacts HA, cameras or weather providers and contains no real keys.
import {createServer} from 'node:http';
import sharp from 'sharp';
const address=process.argv[2];if(!/^192\.168\.\d+\.\d+$/.test(address??''))throw Error('Supply a local test interface address');
const image=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#386b68"/><text x="30" y="180" font-size="32" fill="white">SYNTHETIC CAMERA</text></svg>')).jpeg().toBuffer();
const entities=[['sensor.test_temperature','Temperature','19.2','°C'],['sensor.test_feels','Feels like','18.8','°C'],['sensor.test_wind','Wind','5','km/h'],['sensor.test_gust','Gust','8','km/h'],['camera.test_drive','Drive','idle','']];
const state=([entity_id,name,value,unit])=>({entity_id,state:value,last_reported:new Date().toISOString(),last_updated:new Date().toISOString(),attributes:{friendly_name:name,unit_of_measurement:unit}});
createServer((req,res)=>{
  if(req.headers.authorization!=='Bearer synthetic-only'){res.writeHead(401);return res.end();}
  if(req.url==='/api/camera_proxy/camera.test_drive'){res.writeHead(200,{'Content-Type':'image/jpeg'});return res.end(image);}
  const entity=entities.find(e=>req.url==='/api/states/'+e[0]);
  const result=req.url==='/api/'?{message:'API running.'}:req.url==='/api/states'?entities.map(state):entity?state(entity):null;
  res.writeHead(result?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify(result));
}).listen(3094,address,()=>console.log('Synthetic HA fixture ready'));
