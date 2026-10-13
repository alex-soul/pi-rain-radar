import {createHash} from 'node:crypto';
const clear={SKC:'Sky clear',CLR:'No cloud detected within reporting limits',NSC:'No significant cloud reported',NCD:'No cloud detected',CAVOK:'No operationally significant cloud reported'};
// Extract the observation section only. The general decoder's library does not
// preserve VV/// or all clear-code distinctions, so retain exact source groups.
// Forecast/trend and remarks sections never describe the current sky.
export function observedClouds(raw,{station,observedAt}){
  const codes=[],layers=[];let invalid=false;
  for(const token of raw.match(/\S+/g)??[]){
    const code=token.replace(/=$/,'');
    if(['RMK','TEMPO','BECMG','INTER','NOSIG'].includes(code)||/^(?:PROB\d{2}|FM\d{4,6}|TL\d{4}|AT\d{4})$/.test(code))break;
    if(Object.hasOwn(clear,code)){codes.push(code);continue;}
    const m=/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/.exec(code);
    if(m){codes.push(code);layers.push({code,amount:m[1],baseFt:m[2]==='///'?null:Number(m[2])*100,type:m[3]??''});if(m[1]==='VV'&&m[3])invalid=true;}
    else if(/^(FEW|SCT|BKN|OVC|VV)/.test(code))invalid=true;
  }
  const clears=codes.filter(c=>Object.hasOwn(clear,c));
  if(clears.length>1||clears.length&&layers.length||layers.some(l=>l.amount==='VV')&&layers.length>1)invalid=true;
  const seed=createHash('sha256').update(JSON.stringify([station,observedAt,raw])).digest().readUInt32BE(0);
  const timestamp=raw.match(/(?:^|\s)(\d{6}Z)(?=\s|$)/)?.[1]??'';
  return {version:1,raw:codes.join(' '),layers:invalid?[]:layers,state:invalid?'error':clears.length?'clear':layers.length?'layers':'missing',message:invalid?'Cloud report unavailable':clears.length?clear[clears[0]]:layers.length?'':'Cloud information unavailable',seed,timestamp};
}
export function withObservedClouds(report){
  return report?.product==='metar'&&report.clouds?.version!==1?{...report,clouds:observedClouds(report.raw,report)}:report;
}
