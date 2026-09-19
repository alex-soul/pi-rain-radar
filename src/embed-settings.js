import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { playbackSpeeds } from '../public/weather-format.js';

export const embedDefaults = {enabled:false,origins:['http://homeassistant.local:8123'],hours:2,speed:1,theme:'dark'};
export function validEmbedSettings(s) {
  if(!s || typeof s!=='object' || Object.keys(s).some(k=>!Object.hasOwn(embedDefaults,k)) ||
    typeof s.enabled!=='boolean' || ![2,4,6].includes(s.hours) || !playbackSpeeds.includes(s.speed) ||
    !['light','dark'].includes(s.theme) || !Array.isArray(s.origins) || s.origins.length>10 ||
    (s.enabled&&!s.origins.length)) return false;
  return s.origins.every(origin=>{
    if(typeof origin!=='string'||origin.length>200||/[\s*]/.test(origin))return false;
    try {const url=new URL(origin);return ['http:','https:'].includes(url.protocol)&&url.origin===origin&&!url.username&&!url.password;}catch{return false;}
  });
}
export async function createEmbedSettings(directory) {
  const folder=join(directory,'settings'),file=join(folder,'embed.json');
  let current=structuredClone(embedDefaults),busy=false;
  try {const saved=JSON.parse(await readFile(file,'utf8'));if(validEmbedSettings(saved))current=saved;}catch{/* Missing or invalid optional settings fail closed. */}
  return {
    current:()=>structuredClone(current),
    async configure(input) {
      if(!validEmbedSettings(input))return {status:400,error:'Check the embed options and enter exact http/https origins without paths or wildcards.'};
      if(busy)return {status:409,error:'Embed settings are being saved.'};
      busy=true;
      try {
        const next={...input,origins:[...new Set(input.origins)]};
        await mkdir(folder,{recursive:true,mode:0o700});
        await writeFile(file+'.tmp',JSON.stringify(next),{mode:0o600});await rename(file+'.tmp',file);
        current=next;return {status:200,...this.current()};
      }finally{busy=false;}
    },
  };
}
