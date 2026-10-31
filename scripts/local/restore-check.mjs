import {spawn} from 'node:child_process';
import {createReadStream,readFileSync,openSync,closeSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {artifactPassword} from './artifact-credentials.mjs';
export async function fileHash(file) {
 const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
export async function privateRun(command,args,env,inputFile) {
 const fd=inputFile?openSync(inputFile,'r'):undefined;
 try {
  return await new Promise((ok,fail)=>{
   const child=spawn(command,args,{env,stdio:[fd??'ignore','pipe','ignore']});let output='';
   child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536){child.kill('SIGTERM');fail(Error('Restore process output exceeds bound'));}});
   child.once('error',()=>fail(Error('Restore process unavailable')));child.once('exit',code=>code===0?ok(output):fail(Error('Restore check failed; isolated volumes retained for inspection')));
  });
 } finally {if(fd!==undefined)closeSync(fd);}
}
export async function restoreCheck(directory,credentials,owner,run=privateRun,read=readFileSync) {
 const snapshot=JSON.parse(read(`${directory}/snapshot-ready.json`,'utf8'));
 for(const file of ['assets.sql','worker_checkpoint.sql','storage.tar','asset-copies-snapshot.json'])if(await fileHash(`${directory}/${file}`)!==snapshot.files?.[file])throw Error('Snapshot file integrity mismatch');
 const project=`atlas-restore-${randomUUID().slice(0,8)}`;
 const env={...process.env,ENV:'dev',ATLAS_COMPOSE_PROJECT:project,ATLAS_POSTGRES_PORT:'0',ATLAS_STORAGE_PORT:'0',
  LAB_POSTGRES_ADMIN_PASSWORD:credentials.POSTGRES_ADMIN,LAB_ASSET_DB_PASSWORD:credentials.ASSET_DB,LAB_WORKER_DB_PASSWORD:credentials.WORKER_DB,
  LAB_OBJECT_ADMIN_PASSWORD:credentials.OBJECT_ADMIN,LAB_ASSET_OBJECT_PASSWORD:credentials.ASSET_OBJECT,LAB_WORKER_OBJECT_PASSWORD:credentials.WORKER_OBJECT,
  LAB_ARTIFACT_OBJECT_PASSWORD:artifactPassword(credentials.OBJECT_ADMIN)};
 const compose=(args,input)=>run('docker',['compose',...args],env,input);
 try {
  await compose(['up','-d','--wait','postgres']);
  for(const [database,user] of [['assets','asset_owner'],['worker_checkpoint','worker_owner']])await compose(['exec','-T','postgres','psql','-U',user,'-d',database,'-v','ON_ERROR_STOP=1'],`${directory}/${database}.sql`);
  await compose(['run','--rm','--no-deps','-T','--entrypoint','tar','storage','-C','/data','-xf','-'],`${directory}/storage.tar`);
  await compose(['up','-d','--wait','storage']);
  const port=value=>{const match=/^127\.0\.0\.1:([0-9]+)\s*$/.exec(value);if(!match)throw Error('Unexpected restore port mapping');return Number(match[1]);};
  const pg=port(await compose(['port','postgres','5432'])),storage=port(await compose(['port','storage','9000']));
  const exported=resolve(`${directory}/asset-restored-${Date.now()}.json`);
  await owner('asset-service','export',exported,{ASSET_DB_URL:`jdbc:postgresql://localhost:${pg}/assets`,LAB_OBJECT_ENDPOINT:`http://localhost:${storage}`});
  return {project,exported};
 } finally {await compose(['stop']);}
}
