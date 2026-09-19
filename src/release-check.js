import semver from 'semver';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export const releaseEndpoint='https://api.github.com/repos/alex-soul/pi-rain-radar/releases';
const day=86400000;
const version=tag=>typeof tag==='string'&&tag.length<200?semver.valid(tag.replace(/^v/,'')):null;
export function compareReleases(installed,rows,complete=true){
  const current=version(installed),unique=new Map();
  for(const row of rows){
    if(row.draft||!row.published_at)continue;
    const v=version(row.tag_name);
    if(!v){complete=false;continue;}
    const key=new semver.SemVer(v).version;
    const item={version:key,prerelease:row.prerelease||!!semver.prerelease(key)};
    if(!unique.has(key)||!item.prerelease)unique.set(key,item);
  }
  const all=[...unique.values()].sort((a,b)=>semver.compare(a.version,b.version));
  if(!current)return {state:'unknown',reason:'This development version cannot be compared.',complete:false};
  const newer=all.filter(r=>semver.gt(r.version,current));
  const breakdown={major:0,minor:0,patch:0,prerelease:0};let previous=new semver.SemVer(current);
  for(const item of newer){const next=new semver.SemVer(item.version);
    breakdown[next.major!==previous.major?'major':next.minor!==previous.minor?'minor':next.patch!==previous.patch?'patch':'prerelease']++;previous=next;
  }
  const published=!installed.includes('+')&&all.some(r=>semver.eq(r.version,current));
  return {state:newer.length?'behind':published&&complete?'current':'unknown',reason:!published?'Installed version is not in the checked published releases.':!complete?'Release history is incomplete.':null,
    count:newer.length,breakdown:complete?breakdown:null,prereleases:newer.filter(r=>r.prerelease).length,newest:all.at(-1)?.version??null,complete,published};
}
async function boundedJson(response){
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw Error('Release response too large.');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function createReleaseCheck(directory,installed,{fetcher=fetch,now=Date.now,timeout=20000}={}){
  const folder=join(directory,'settings'),file=join(folder,'release-check.json');
  let cache={lastAttempt:null,checkedAt:null,nextAttempt:0,result:null,error:null,rows:[],complete:false},busy=false;
  try{const raw=await readFile(file,'utf8');if(raw.length<100000){const c=JSON.parse(raw);if(c.schema===1&&Number.isFinite(c.nextAttempt)&&Array.isArray(c.rows)&&c.rows.length<=300){cache=c;cache.result=compareReleases(installed,c.rows,c.complete);}}}catch{/* Start with an unknown result. */}
  const persist=async()=>{await mkdir(folder,{recursive:true});await writeFile(file+'.tmp',JSON.stringify({...cache,schema:1}));await rename(file+'.tmp',file);};
  const status=()=>({...cache.result,state:cache.result?.state??'unknown',lastAttempt:cache.lastAttempt,checkedAt:cache.checkedAt,error:cache.error,stale:!cache.checkedAt||now()-cache.checkedAt>=day});
  async function check(){
    if(busy||now()<cache.nextAttempt)return;busy=true;
    cache.lastAttempt=now();cache.nextAttempt=now()+day;
    try{
      // Persist cadence before contacting GitHub so restart cannot cause a retry loop.
      await persist();
      const rows=[];let complete=true;const signal=AbortSignal.timeout(timeout);
      for(let page=1;page<=3;page++){
        const response=await fetcher(`${releaseEndpoint}?per_page=100&page=${page}`,{signal,redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'Pi-Rain-Radar-release-check','X-GitHub-Api-Version':'2022-11-28'}});
        if(!response.ok){
          const retry=response.headers.get('retry-after'),reset=Number(response.headers.get('x-ratelimit-reset'))*1000;
          const retryTime=retry?(Number.isFinite(Number(retry))?now()+Number(retry)*1000:Date.parse(retry)):0;
          cache.nextAttempt=Math.max(cache.nextAttempt,Number.isFinite(retryTime)?retryTime:0,Number.isFinite(reset)?reset:0);
          throw Error(response.status===403||response.status===429?'GitHub rate limit; the check will retry later.':'Could not check published releases.');
        }
        const data=await boundedJson(response);
        if(!Array.isArray(data)||data.length>100||data.some(r=>!r||typeof r.tag_name!=='string'||typeof r.draft!=='boolean'||typeof r.prerelease!=='boolean'||(r.published_at!==null&&typeof r.published_at!=='string')))throw Error('Unexpected release response.');
        rows.push(...data.map(({tag_name,draft,prerelease,published_at})=>({tag_name,draft,prerelease,published_at})));
        const more=/rel="next"/.test(response.headers.get('link')??'');
        if(!more)break;
        if(page===3)complete=false;
      }
      cache.rows=rows;cache.complete=complete;cache.result=compareReleases(installed,rows,complete);cache.checkedAt=now();cache.error=null;
    }catch(error){cache.error=error.name==='TimeoutError'||error.name==='AbortError'?'Release check timed out.':error.message==='Release response too large.'||error.message==='Unexpected release response.'||error.message?.startsWith('GitHub rate')?error.message:'Could not check published releases.';}
    finally{try{await persist();}catch{cache.error='Could not save the release check.';}busy=false;}
  }
  return {status,check};
}
