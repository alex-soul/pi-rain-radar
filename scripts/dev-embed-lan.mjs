// Optional LAN transport for the synthetic studio only. No Settings or console routes.
// Start dev:scenarios first, then: node scripts/dev-embed-lan.mjs <local-LAN-IP>
import {createServer} from 'node:http';
const host=process.argv[2]??'127.0.0.1';
if(!/^(127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(host))throw new Error('Choose a specific private LAN IPv4 address.');
const files=new Set(['/embed','/embed.js','/embed.css','/frame-loader.js','/playback.js','/health.js','/live-window.js','/api/status']);
createServer(async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  if(!['GET','HEAD'].includes(req.method)||!(files.has(path)||/^\/frames\/\d+-[a-f0-9]{12}\.png$/.test(path)||/^\/maps\/[a-f0-9]{12}\/basemap(-dark)?\.svg$/.test(path))){res.writeHead(404);return res.end();}
  try {
    const response=await fetch('http://127.0.0.1:3091'+req.url,{method:req.method,signal:AbortSignal.timeout(12000)});
    const body=Buffer.from(await response.arrayBuffer()),headers=Object.fromEntries(response.headers);
    delete headers['content-encoding'];delete headers['transfer-encoding'];headers['content-length']=body.length;
    res.writeHead(response.status,headers);res.end(body);
  }catch{res.writeHead(503);res.end('Synthetic backend unavailable');}
}).listen(3092,host,()=>console.log(JSON.stringify({embed:`http://${host}:3092/embed`,pid:process.pid})));
