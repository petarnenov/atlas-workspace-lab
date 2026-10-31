import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {main,reconcile,summary} from './artifact-maintenance.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const copy={tenantId:'tenant-a',assetId:'asset-a',inputEventId:'event-a',sourceSha256:'a'.repeat(64),markdown:'Saved',nativeJson:'{}',markdownSha256:hash('Saved'),nativeSha256:hash('{}'),converter:'alternate',pipeline:'plain',pageCount:1};
test('conservative reconciliation retains committed, referenced, unknown and ambiguous state',()=>{
 const manifest={tenant_id:'t',asset_id:'a',input_event_id:'e',artifact_id:'orphan',state:'STAGED'};
 const ledger={tenantId:'t',assetId:'a',inputEventId:'e',sent:true,outcome:{outcome:'COMPLETED',artifactId:'winner'}};
 assert.equal(reconcile([manifest],[ledger])[0].decision,'CANDIDATE_ONLY_NO_DELETE');
 for(const rows of [[],[ledger,ledger],[{...ledger,sent:false}],[{...ledger,outcome:{outcome:'COMPLETED',artifactId:'orphan'}}]])assert.equal(reconcile([manifest],rows)[0].decision,'RETAIN_UNKNOWN_OR_REFERENCED');
 assert.equal(reconcile([{...manifest,state:'COMMITTED'}],[])[0].decision,'RETAIN_COMMITTED');assert.throws(()=>reconcile(Array(1001).fill(manifest),[]));let tick=0;assert.throws(()=>reconcile([manifest],[ledger],()=>tick++*61000),/deadline/);
 assert.deepEqual(summary([copy]),summary([{...copy}]));assert.doesNotThrow(()=>summary([{...copy,nativeJson:undefined,nativeSha256:undefined}]));assert.throws(()=>summary([{...copy,markdown:'changed'}]));
});
test('paused owner processes snapshot, repeat migration, verify rollback and resume without cross-owner credentials',async()=>{
 const original=process.cwd(),dir=mkdtempSync(join(tmpdir(),'atlas-maintenance-'));const originalEnv=process.env.ENV;
 try {
  process.chdir(dir);process.env.ENV='dev';mkdirSync('.local/helm/dev',{recursive:true});writeFileSync('.local/helm/dev/credentials.json',JSON.stringify({OBJECT_ADMIN:'a'.repeat(48),ASSET_DB:'asset-secret-fixture',WORKER_DB:'worker-secret-fixture'}));
  const calls=[];let closed=0,corrupt=false;const replicas={'workspace-api':1,'processing-worker':1,'asset-service':1};
  const fixture=(file,owner,rows)=>writeFileSync(file,JSON.stringify({schemaVersion:'1',owner,rows}));
  const deps={runtime:{context:'kind-atlas-test',guard:()=>{},kubectlTool:'synthetic-kubectl',root:'.local/k8s'},release:{directory:()=>'.local/helm/dev',assertNamespace:()=>{},assertCredentials:()=>{},kube:(_env,args)=>{
   calls.push(args);
   if(args[0]==='get')return JSON.stringify({items:Object.keys(replicas).map(name=>({metadata:{name},spec:{replicas:replicas[name]}}))});
   if(args[0]==='scale')replicas[args[1].slice('deployment/'.length)]=Number(args[2].split('=')[1]);
   if(args.includes('psql'))return '0';if(args.includes('sh'))return '-- synthetic owner dump';return '';
  }},openForward:async()=>({port:12345,close:()=>closed++}),start:(_command,_args,options)=>{
   writeFileSync(options.stdio[1],'synthetic storage snapshot');const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',0));return child;
  },runProcess:async(_command,args,env)=>{
   const operation=args.find(arg=>arg.startsWith('-PmaintenanceAction=')).split('=')[1];const file=args.find(arg=>arg.startsWith('-PmaintenanceFile=')).slice('-PmaintenanceFile='.length);
   assert.equal(env.ENV,'dev');assert.equal(env.ATLAS_MAINTENANCE_PAUSED,'1');
   const worker=args[0].includes('processing-worker');
   assert.equal(Boolean(env.LAB_ASSET_DB_PASSWORD),!worker);assert.equal(Boolean(env.LAB_WORKER_DB_PASSWORD),worker);assert.equal(Boolean(env.LAB_ARTIFACT_OBJECT_PASSWORD),!worker);assert.equal(env.OBJECT_ADMIN,undefined);
   if(operation==='export')fixture(file,worker?'worker-copies':'asset-copies',corrupt?[{...copy,markdown:'changed'}]:[copy]);
   if(operation==='snapshot')fixture(file,worker?'worker-ledger':'asset-manifests',[]);
  }};
  await assert.rejects(main('migrate',deps),/pause/);await assert.rejects(main('other',deps));
  process.env.ENV='prod';await assert.rejects(main('pause',deps),/dev-only/);process.env.ENV='dev';
  await main('pause',deps);assert.ok(existsSync('.local/maintenance/window.json'));await assert.rejects(main('pause',deps),/Existing/);
  await assert.rejects(main('migrate',deps),/snapshot/);
  await main('snapshot',deps);await main('migrate',deps);await main('migrate',deps);await main('verify',deps);await main('reconcile',deps);await main('rollback-copy',deps);
  corrupt=true;await assert.rejects(main('verify',deps),/checksum/);corrupt=false;
  await main('resume',deps);assert.equal(existsSync('.local/maintenance/window.json'),false);assert.ok(calls.some(args=>args.includes('deployment/processing-worker')&&args.includes('--replicas=1')));assert.ok(closed>=10);
 } finally {process.chdir(original);if(originalEnv===undefined)delete process.env.ENV;else process.env.ENV=originalEnv;rmSync(dir,{recursive:true,force:true});}
});
