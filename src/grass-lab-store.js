// Runs inside the existing SQLite worker, never on the HTTP event loop.
const DAY=86400000,keys=['temperature','dew','wind','irradiance'];
const pick=(v,fields)=>Object.fromEntries(fields.filter(k=>v?.[k]!==undefined).map(k=>[k,v[k]]));
const row=v=>pick(v,['source','entity','unit','value','time','receivedAt','eligible','resetAt','previousPeriod']);
function stateFrom(reading){
 const p=reading?.provenance;if(!p||!Number.isFinite(reading.moisture))return null;
 const rain=p.rain;
 return {modelVersion:reading.modelVersion,moisture:reading.moisture,startedAt:reading.startedAt,
   sources:JSON.stringify([keys.map(k=>[p.inputs[k].source,p.inputs[k].entity,p.inputs[k].unit]),rain.entity,rain.unit,p.location,p.connectionRevision??null]),
   baseline:{time:rain.receivedAt,total:rain.value*({mm:1,cm:10,in:25.4}[rain.unit]),resetAt:rain.resetAt}};
}
export function grassTables(db){db.exec(`
 CREATE TABLE IF NOT EXISTS grass_samples(context TEXT NOT NULL,time INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(context,time));
 CREATE TABLE IF NOT EXISTS grass_observations(id TEXT PRIMARY KEY,context TEXT NOT NULL,observed_at INTEGER NOT NULL,data TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS grass_observed ON grass_observations(context,observed_at);
 CREATE TABLE IF NOT EXISTS grass_markers(id TEXT PRIMARY KEY,context TEXT NOT NULL,time INTEGER NOT NULL,data TEXT NOT NULL);
`);}
export function saveGrassSample(db,r,previousState){
 if(r.kind!=='weather'||r.source!=='presentation')return;
 const p=typeof r.data==='string'?JSON.parse(r.data):r.data;
 const snapshot={location:p.location,connectionRevision:p.connectionRevision??null,policy:{grassWetness:p.policy?.grassWetness},
   rows:Object.fromEntries(keys.map(k=>[k,row(p.rows?.[k])])),observedRain:row(p.observedRain),
   grassWetness:p.grassWetness?pick(p.grassWetness,['modelVersion','parameters','calculatedAt','eligible','intensity','moisture','startedAt','reason']):undefined,
   grassState:previousState??stateFrom(p.grassWetness)};
 db.prepare('INSERT OR IGNORE INTO grass_samples VALUES(?,?,?)').run(r.context,r.time,JSON.stringify(snapshot));
 return snapshot.grassState;
}
export function seedGrass(db,now){
 const states=new Map();
 for(const r of db.prepare("SELECT r.context,r.time,r.data FROM records r WHERE r.kind='weather' AND r.source='presentation' AND r.time>=? AND NOT EXISTS(SELECT 1 FROM grass_samples g WHERE g.context=r.context AND g.time=r.time) ORDER BY r.time").iterate(now-30*DAY)){
   const p=JSON.parse(r.data),state=stateFrom(p.grassWetness)??states.get(r.context)??null;
   if(state)states.set(r.context,state);
   saveGrassSample(db,{...r,kind:'weather',source:'presentation'},state);
 }
}
export function trimGrass(db,now){
 // Keep one boundary sample per location for exact reservoir initialization.
 db.prepare('DELETE FROM grass_samples WHERE time<? AND time<>(SELECT MAX(g.time) FROM grass_samples g WHERE g.context=grass_samples.context AND g.time<?)').run(now-30*DAY,now-30*DAY);
}
export function readGrass(db,context,now){
 const rows=db.prepare('SELECT time,data FROM grass_samples WHERE context=? ORDER BY time DESC LIMIT 30001').all(context);
 if(rows.length>30000)throw Error('Grass history exceeds the bounded lab window');
 return {presentations:rows.reverse().map(r=>({time:r.time/1000,...JSON.parse(r.data)})),
   observations:db.prepare('SELECT data FROM grass_observations WHERE context=? ORDER BY observed_at').all(context).map(r=>JSON.parse(r.data)),
   markers:db.prepare('SELECT data FROM grass_markers WHERE context=? ORDER BY time').all(context).map(r=>JSON.parse(r.data)),capturedAt:now,requestedStart:now-30*DAY};
}
export function putGrassObservation(db,context,value){
 const existing=db.prepare('SELECT context,data FROM grass_observations WHERE id=?').get(value.id);
 if(existing){const old=JSON.parse(existing.data);if(existing.context!==context||old.observedAt!==value.observedAt||old.intensity!==value.intensity||old.note!==value.note)throw Error('Observation ID already used');return old;}
 if(db.prepare('SELECT COUNT(*) AS n FROM grass_observations').get().n>=50000)throw Error('Observation limit reached; export the archive');
 db.prepare('INSERT INTO grass_observations VALUES(?,?,?,?)').run(value.id,context,value.observedAt,JSON.stringify(value));return value;
}
export function validateObservation(input,now){
 if(!input||typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.id)||!Number.isSafeInteger(input.observedAt)||input.observedAt<0||input.observedAt>now+300000||!Number.isInteger(input.intensity)||input.intensity<0||input.intensity>5||typeof input.note!=='string'||input.note.length>500)throw Error('Choose an intensity from 0 to 5 and a valid observation time');
 return {id:input.id,observedAt:input.observedAt,intensity:input.intensity,note:input.note.trim(),loggedAt:now,synthetic:false};
}
