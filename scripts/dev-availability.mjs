// Repeatable UI-only observations and media. No external requests or credentials.
export const availabilityCases=[
 ['availability-cloud-delay','Clouds 24 minutes old','Healthy acquisition with delayed cloud imagery on both maps.','Handle green; Total and cloud gaps remain honest. Compare Clouds stale and All layers available.'],
 ['availability-cloud-stale','Clouds stale','Cloud imagery is over thirty minutes old.','Handle red; return to Clouds 24 minutes old to check recovery.'],
 ['availability-healthy','All layers available','Four complete rows. All images and measurements are synthetic.','All rows teal. Scrub or click any segment; the total is teal.'],
 ['availability-gaps','Short gaps','Main rain and Overview clouds each miss isolated frames.','Live borrows in amber; the same Archive timestamps are red with blank affected overlays.'],
 ['availability-outage','Long gaps','Rain, clouds, weather and camera each have a prolonged gap.','Red marks missing data after the Live reuse limit. Tap red segments for source details.'],
 ['availability-disabled','Optional sources off','Weather, camera and clouds are currently disabled; their stored history remains.','Live shows Rain only. Archive restores all four historical rows.'],
 ['availability-failed','Enabled but failing','Optional acquisition remains enabled but recent observations are absent.','Rows remain visible with gaps, rather than disappearing on failure.'],
 ['availability-slow','Slow images','Synthetic images take 700ms to arrive.','Previous images stay visible while the replacement decodes. Try fast scrubbing and camera Archive playback.'],
 ['availability-recovered','All layers recovered','Restore complete history and healthy current collection.','All rows return to teal; playback and images recover without a reload.']
];
export function syntheticAvailability(data,{scenario,archive=false}){
 if(!Array.isArray(data.frames))return data;
 const off=scenario==='availability-disabled'&&!archive,now=Date.now(),end=data.end,start=data.start,frames=[],clouds=[],camera=[],weather=[];
 const prolonged=['availability-outage','availability-failed'].includes(scenario),short=scenario==='availability-gaps';
 for(let time=start-1800;time<=end;time+=300){
  const slot=Math.round((time-start)/600),recent=scenario==='availability-failed'&&time>end-2400,block=prolonged&&slot>=4&&slot<=8||recent;
  const asset=(layer)=>`/__dev/availability/${layer}/${time}.svg?case=${scenario}`;
  const optionalBlock=block||scenario==='availability-disabled'&&time>=end-1200;
  if(!optionalBlock)camera.push({time:time*1000,receivedAt:time*1000,source:'synthetic-camera',basis:'metadata',asset:asset('camera'),data:{name:'Synthetic camera'}});
  if(time%600)continue;
  if(!optionalBlock)weather.push({time,current:{time,temperature:14+slot%3,feelsLike:12,windMph:9,windDirection:225,humidity:70,pressure:1012,dewPoint:8,visibility:10000,uvi:2},receivedAt:time*1000});
  const cloudBlock=optionalBlock||scenario==='availability-cloud-delay'&&time>end-1200||scenario==='availability-cloud-stale'&&time>end-2400;
  const c={time,url:!cloudBlock?asset('cloud-main'):null,overviewUrl:!cloudBlock&&!(short&&slot===7)?asset('cloud-overview'):null};clouds.push(c);
  if(time<start)continue;
  frames.push({time,url:!block&&!(short&&slot===4)?asset('rain-main'):null,overviewUrl:!block?asset('rain-overview'):null,source:'rainviewer',overviewSource:'rainviewer',expectedSources:{main:'rainviewer',overview:'rainviewer'}});
 }
 for(const f of frames)for(const role of ['main','overview']){const c=clouds.findLast(c=>c.time<=f.time&&(archive?c.time===f.time:c.time>f.time-1800)&&c[role==='main'?'url':'overviewUrl']);f[role==='main'?'cloudUrl':'overviewCloudUrl']=off?null:c?.[role==='main'?'url':'overviewUrl']??null;f[role==='main'?'cloudTime':'overviewCloudTime']=c?.time??null;}
 const mappings=Object.fromEntries(['temperature','feelsLike','wind','windDirection','gust','humidity','pressure','dewPoint','visibility','uvi'].map(k=>[k,off?'disabled':'owm']));
 return {...data,collectionPeriods:[{time:start-1800,camera:true,clouds:true,cloudMap:'both'},...(scenario==='availability-disabled'?[{time:end-1200,weather:false,camera:false,clouds:false,cloudMap:'both'}]:[])],frames,frame:frames.at(-1),radarDisabled:false,cloudHistory:{frames:clouds,roles:['main','overview']},clouds:{enabled:!off,configured:true,map:'both',latest:{main:now-(scenario==='availability-cloud-delay'?1440000:scenario==='availability-cloud-stale'?2400000:0),overview:now-(scenario==='availability-cloud-delay'?1440000:scenario==='availability-cloud-stale'?2400000:0)},lastSuccess:now,state:scenario==='availability-failed'?'error':scenario==='availability-cloud-delay'?'delayed':scenario==='availability-cloud-stale'?'stale':'ready'},camera:{enabled:!off,source:'synthetic-camera',name:'Synthetic camera',lastSuccess:now,fresh:!prolonged},cameraHistory:{records:camera,counts:{metadata:camera.length,acquisition:0}},weatherHistory:{weather,policies:[],presentations:[]},weatherPolicy:{owmCollect:!off,haCollect:false,mappings},coverage:frames.map(f=>({time:f.time,main:!!f.url,overview:!!f.overviewUrl,sources:f.expectedSources})),complete:!prolonged&&!short};
}
export function syntheticMedia(layer,time){
 const overview=layer.endsWith('overview'),w=overview?390:1280,h=overview?280:720,phase=(time/600)%12,x=w*(.25+phase*.035);
 const shapes=layer==='camera'?`<rect width="${w}" height="${h}" fill="#31564d"/><path d="M300 720L580 200H690L1050 720" fill="#82918a"/><circle cx="${x}" cy="170" r="40" fill="#c5c49b"/><text x="35" y="65" fill="white" font-size="28">SYNTHETIC CAMERA</text><text x="35" y="660" fill="white" font-size="25">${new Date(time*1000).toISOString()}</text>`:layer.startsWith('cloud')?`<g fill="#e1e5e4" opacity=".55"><ellipse cx="${x}" cy="${h*.4}" rx="${w*.28}" ry="${h*.23}"/><ellipse cx="${x+w*.23}" cy="${h*.56}" rx="${w*.25}" ry="${h*.18}"/></g>`:`<ellipse cx="${x}" cy="${h*.5}" rx="${w*.15}" ry="${h*.18}" fill="#55b6bb"/><ellipse cx="${x}" cy="${h*.5}" rx="${w*.075}" ry="${h*.1}" fill="#388ac7"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${shapes}</svg>`;
}
