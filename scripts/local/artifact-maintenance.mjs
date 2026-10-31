import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as helm from '../helm/runtime.mjs';
import * as native from '../k8s/runtime.mjs';
import {artifactPassword} from './artifact-credentials.mjs';

export function reconcile(manifests,ledger) {
 if(manifests.length>1000||ledger.length>1000)throw Error('Maintenance batch exceeds 1000');
 const deadline=Date.now()+60000;
 return manifests.map(item=>{
  if(Date.now()>deadline)throw Error('Reconciliation deadline exceeded');
  const candidates=ledger.filter(row=>row.tenantId===item.tenant_id&&row.assetId===item.asset_id&&row.inputEventId===item.input_event_id);
  const known=candidates.length===1&&candidates[0].sent===true&&['COMPLETED','FAILED'].includes(candidates[0].outcome?.outcome);
  const referenced=ledger.some(row=>row.outcome?.artifactId===item.artifact_id);
  return {tenantId:item.tenant_id,artifactId:item.artifact_id,decision:item.state==='COMMITTED'?'RETAIN_COMMITTED':!known||referenced?'RETAIN_UNKNOWN_OR_REFERENCED':'CANDIDATE_ONLY_NO_DELETE'};
 });
}
export function summary(rows) {
 const tenants={};
 for(const row of rows) {
  const digest=value=>value==null?null:createHash('sha256').update(value).digest('hex');
  if(digest(row.markdown)!==row.markdownSha256||digest(row.nativeJson)!==row.nativeSha256)throw Error('Archive content checksum mismatch');
  (tenants[row.tenantId]??=[]).push([row.assetId,row.inputEventId,row.sourceSha256,row.markdownSha256,row.nativeSha256,row.converter,row.pipeline,row.pageCount]);
 }
 return Object.fromEntries(Object.entries(tenants).sort().map(([tenant,values])=>[tenant,{count:values.length,sha256:createHash('sha256').update(JSON.stringify(values.sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex')}]));
}
function exchange(file,owner) {
 const value=JSON.parse(readFileSync(file,'utf8'));
 if(value.schemaVersion!=='1'||value.owner!==owner||!Array.isArray(value.rows)||value.rows.length>1000)throw Error('Invalid owner archive');
 return value.rows;
}
async function forward(service,remote) {
 const child=spawn(native.kubectlTool,['--kubeconfig',`${native.root}/kubeconfig`,'--context',native.context,'-n','atlas-dev','port-forward','--address=127.0.0.1',`service/${service}`,`:${remote}`],{stdio:['ignore','pipe','pipe']});
 try {
  const port=await new Promise((ok,fail)=>{
   const timer=setTimeout(()=>fail(Error('Maintenance forwarding timeout')),15000);let output='';
   child.stdout.on('data',chunk=>{output+=chunk;const match=/127\.0\.0\.1:(\d+) ->/.exec(output);if(match){clearTimeout(timer);ok(Number(match[1]));}});
   for(const event of ['error','exit'])child.once(event,()=>{clearTimeout(timer);fail(Error('Maintenance forwarding unavailable'));});
  });
  return {port,close:()=>child.kill('SIGTERM')};
 } catch(error) {child.kill('SIGTERM');throw error;}
}
function execute(command,args,env) {
 return new Promise((ok,fail)=>{const child=spawn(command,args,{env,stdio:['ignore','inherit','inherit']});child.once('error',fail);child.once('exit',code=>code===0?ok():fail(Error('Owner maintenance process failed')));});
}
export async function main(action,{runtime=native,release=helm,openForward=forward,runProcess=execute,start=spawn}={}) {
 if((process.env.ENV??'dev')!=='dev')throw Error('Maintenance is dev-only');
 if(!['pause','snapshot','migrate','verify','rollback-copy','reconcile','resume'].includes(action))throw Error('Unknown maintenance action');
 runtime.guard();release.assertNamespace('dev');release.assertCredentials('dev');
 const root=resolve(`${runtime.runtimeRoot??'.local'}/maintenance`);mkdirSync(root,{recursive:true,mode:0o700});
 const stateFile=`${root}/window.json`;
 const kube=(args,options)=>release.kube('dev',args,options);
 const query=(database,sql)=>kube(['exec','statefulset/postgres','--','psql','-U','local_admin','-d',database,'-Atc',sql],{quiet:true,sensitive:true}).trim();
 if(action==='pause') {
  if(existsSync(stateFile))throw Error('Existing maintenance window preserved; resume it first');
  const deployments=JSON.parse(kube(['get','deployments','-o','json'],{quiet:true})).items;
  const replicas=Object.fromEntries(['workspace-api','processing-worker','asset-service'].map(name=>[name,deployments.find(d=>d.metadata.name===name)?.spec.replicas??0]));
  const directory=`${root}/${Date.now()}`;mkdirSync(directory,{mode:0o700});
  const window={directory,replicas,context:runtime.context,pausedAt:new Date().toISOString(),phase:'PAUSING'};
  writeFileSync(stateFile,JSON.stringify(window),{mode:0o600,flag:'wx'});
  kube(['scale','deployment/workspace-api','--replicas=0']);
  const deadline=Date.now()+120000;
  while(query('worker_checkpoint',"SELECT count(*) FROM checkpoint WHERE outcome IS NULL OR sent=false OR lease_until>now()")!=='0'||query('assets',"SELECT (SELECT count(*) FROM asset WHERE status IN ('PENDING','PROCESSING'))+(SELECT count(*) FROM upload_outbox WHERE sent=false)")!=='0') {
   if(Date.now()>deadline)throw Error('Drain incomplete; API remains paused, inspect durable failures before retry');
   await new Promise(ok=>setTimeout(ok,1000));
  }
  for(const name of ['processing-worker','asset-service'])kube(['scale',`deployment/${name}`,'--replicas=0']);
  for(const name of Object.keys(replicas))kube(['wait','--for=delete','pod','-l',`app=${name}`,'--timeout=90s'],{quiet:true});
  writeFileSync(stateFile,JSON.stringify({...window,phase:'DRAINED'}),{mode:0o600});
  console.log('Dev uploads and processing paused and drained. Snapshot before migration.');return;
 }
 if(!existsSync(stateFile))throw Error('Run make artifacts-pause first');
 const state=JSON.parse(readFileSync(stateFile));
 if(state.context!==runtime.context)throw Error('Maintenance cluster differs');
 const directory=state.directory;
 if(action==='resume') {
  // Retain history and backup files, replace only the window marker after restored replicas are ready.
  for(const name of ['asset-service','processing-worker','workspace-api'])kube(['scale',`deployment/${name}`,`--replicas=${state.replicas[name]}`]);
  for(const name of Object.keys(state.replicas))if(state.replicas[name]>0)kube(['rollout','status',`deployment/${name}`,'--timeout=180s']);
  const {renameSync}=await import('node:fs');renameSync(stateFile,`${directory}/closed-window.json`);return;
 }
 if(state.phase!=='DRAINED')throw Error('Drain incomplete; inspect failures or run make artifacts-resume');
 const pg=await openForward('postgres',5432);let storage;
 try {storage=await openForward('storage',9000);}catch(error){pg.close();throw error;}
 try {
  const credentials=JSON.parse(readFileSync(`${release.directory('dev')}/credentials.json`,'utf8'));
  const common={PATH:process.env.PATH,JAVA_HOME:process.env.JAVA_HOME,HOME:process.env.HOME,ENV:'dev',ATLAS_MAINTENANCE_PAUSED:'1'};
  const owner=async(component,operation,file)=>{
   const worker=component==='processing-worker';
   const env=worker?{...common,WORKER_DB_URL:`jdbc:postgresql://localhost:${pg.port}/worker_checkpoint`,LAB_WORKER_DB_PASSWORD:credentials.WORKER_DB}:{...common,ASSET_DB_URL:`jdbc:postgresql://localhost:${pg.port}/assets`,LAB_ASSET_DB_PASSWORD:credentials.ASSET_DB,LAB_OBJECT_ENDPOINT:`http://localhost:${storage.port}`,LAB_ARTIFACT_OBJECT_PASSWORD:artifactPassword(credentials.OBJECT_ADMIN)};
   await runProcess('./gradlew',[`:${component}:maintenance`,`-PmaintenanceAction=${operation}`,`-PmaintenanceFile=${file}`,'--no-daemon'],env);
  };
  const workerExport=`${directory}/worker-copies.json`,assetExport=`${directory}/asset-copies-${Date.now()}.json`;
  if(action==='snapshot') {
   for(const [database,user,variable] of [['assets','asset_owner','ASSET_DB_PASSWORD'],['worker_checkpoint','worker_owner','WORKER_DB_PASSWORD']]) {
    const dump=kube(['exec','statefulset/postgres','--','sh','-ec',`PGPASSWORD="$${variable}" pg_dump -U ${user} -d ${database} --no-owner --no-privileges`],{quiet:true,sensitive:true});
    writeFileSync(`${directory}/${database}.sql`,dump,{mode:0o600,flag:'wx'});
   }
   // Storage is quiescent after all writer deployments have stopped. The tar stays private/local.
   const tarArgs=['--kubeconfig',`${runtime.root}/kubeconfig`,'--context',runtime.context,'-n','atlas-dev','exec','statefulset/storage','--','tar','-C','/data','-cf','-','.'];
   const {openSync,closeSync}=await import('node:fs');const fd=openSync(`${directory}/storage.tar`,'wx',0o600);
   try {await new Promise((ok,fail)=>{const child=start(runtime.kubectlTool,tarArgs,{stdio:['ignore',fd,'pipe']});child.once('error',fail);child.once('exit',code=>code===0?ok():fail(Error('Storage snapshot failed')));});} finally {closeSync(fd);}
   await owner('processing-worker','snapshot',`${directory}/worker-ledger.json`);await owner('asset-service','snapshot',`${directory}/asset-manifests.json`);
   await owner('processing-worker','export',workerExport);
   writeFileSync(`${directory}/snapshot-ready.json`,JSON.stringify({context:runtime.context,createdAt:new Date().toISOString(),worker:summary(exchange(workerExport,'worker-copies'))}),{mode:0o600,flag:'wx'});
  } else {
   if(!existsSync(`${directory}/snapshot-ready.json`))throw Error('A complete DB/object/ledger snapshot is required');
   if(action==='migrate')await owner('asset-service','import',workerExport);
   if(['migrate','verify','rollback-copy'].includes(action)) {
    await owner('asset-service','export',assetExport);
    if(action==='rollback-copy')await owner('processing-worker','restore',assetExport);
    const expected=exchange(workerExport,'worker-copies'),actual=exchange(assetExport,'asset-copies');
    const historical=actual.filter(row=>expected.some(old=>old.tenantId===row.tenantId&&old.assetId===row.assetId));
    if(JSON.stringify(summary(expected))!==JSON.stringify(summary(historical)))throw Error('Per-tenant migration verification failed; copies retained for investigation');
    if(action==='rollback-copy') {
     const restored=`${directory}/worker-restored-${Date.now()}.json`;await owner('processing-worker','export',restored);
     if(JSON.stringify(summary(exchange(restored,'worker-copies')))!==JSON.stringify(summary(actual)))throw Error('Rollback verification failed; do not restore legacy routing');
    }
    writeFileSync(`${directory}/${action}-${Date.now()}.json`,JSON.stringify({context:runtime.context,verified:true,tenants:summary(actual)}),{mode:0o600});
   } else if(action==='reconcile') {
    const manifests=`${directory}/asset-manifests-${Date.now()}.json`,ledger=`${directory}/worker-ledger-${Date.now()}.json`;
    await owner('asset-service','snapshot',manifests);await owner('processing-worker','snapshot',ledger);
    writeFileSync(`${directory}/reconcile-${Date.now()}.json`,JSON.stringify({dryRun:true,rows:reconcile(exchange(manifests,'asset-manifests'),exchange(ledger,'worker-ledger'))}),{mode:0o600});
   }
  }
 } finally {pg.close();storage.close();}
 console.log('Maintenance action completed; private evidence saved under .local/maintenance. No content deleted.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1;});
