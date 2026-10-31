import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash,createHmac,sign} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import * as helm from '../scripts/helm/runtime.mjs';
import * as native from '../scripts/k8s/runtime.mjs';
import {forward} from '../scripts/local/parsed-copy.mjs';
import {syntheticPdf} from '../e2e/fixtures/pdf';

// Test-only substitute worker. Its volatile ledger proves the wire/fence boundary,
// not production durability; the regular worker restart suite proves its SQL ledger.
class HarnessLedger {
 fence=1; outcome:string|undefined;
 claim(){return ++this.fence;}
 finish(fence:number,payload:string){if(fence!==this.fence||this.outcome)return false;this.outcome=payload;return true;}
}
test.use({baseURL:`http://127.0.0.1:${process.env.ATLAS_UI_PORT??5173}`});
test('replacement worker harness preserves staged fencing, retries and neutral reads with original services',async({request})=>{
 test.setTimeout(240000);
 const kube=(args:string[],options?:any)=>helm.kube('dev',args,options);
 const deployments=()=>JSON.parse(kube(['get','deployments','-o','json'],{quiet:true})).items;
 const before=deployments(),worker=before.find((d:any)=>d.metadata.name==='processing-worker');
 const connections:any[]=[];
 const connect=async(service:string,port:number)=>{
  const connection=forward('dev',(command:string,args:string[],options:any)=>spawn(command,args.map(arg=>arg==='service/workspace-api'?`service/${service}`:arg===':8080'?`:${port}`:arg),options));
  connections.push(connection);return `http://127.0.0.1:${await connection.ready}`;
 };
 const directory=helm.directory('dev'),credentials=JSON.parse(readFileSync(`${directory}/credentials.json`,'utf8'));
 const tenant='11111111-1111-4111-8111-111111111111';
 const identity=(aud='asset-artifact-write',subject='processing-worker',scope=tenant)=>{
  const now=Math.floor(Date.now()/1000),encode=(value:any)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:'lab-worker',aud,sub:subject,tenantId:scope,iat:now,nbf:now,exp:now+60})}`;
  return `${unsigned}.${sign('RSA-SHA256',Buffer.from(unsigned),readFileSync(`${directory}/worker-private.pem`)).toString('base64url')}`;
 };
 const publicHeaders={Authorization:`Bearer ${native.token('a',directory)}`};
 try {
  kube(['scale','deployment/processing-worker','--replicas=0'],{quiet:true});
  kube(['wait','--for=delete','pod','-l','app=processing-worker','--timeout=90s'],{quiet:true});
  const api=await connect('workspace-api',8080);
  const pdf=syntheticPdf(),key=randomUUID();
  const upload=()=>request.post(`${api}/api/v1/assets`,{headers:{...publicHeaders,'Idempotency-Key':key},multipart:{file:{name:'synthetic.pdf',mimeType:'application/pdf',buffer:pdf}}});
  const accepted=await upload();expect(accepted.status()).toBe(202);const receipt=await accepted.json();
  expect((await (await upload()).json()).assetId).toBe(receipt.assetId);
  // Independent consumer group: never move the real worker's committed offsets.
  const argv=['--kubeconfig',`${native.root}/kubeconfig`,'--context',native.context,'-n','atlas-dev','exec','statefulset/kafka','--','/opt/kafka/bin/kafka-console-consumer.sh','--bootstrap-server','kafka-client:19092','--topic','asset.uploaded.v1','--from-beginning','--timeout-ms','8000','--consumer-property','enable.auto.commit=false','--group',`contract-${randomUUID()}`];
  let messages='';
  try {messages=execFileSync(native.kubectlTool,argv,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:25000,maxBuffer:1024*1024});}
  catch(error:any){if(typeof error.stdout!=='string')throw Error('Replacement input unavailable');messages=error.stdout;}
  const inputs=messages.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  const input=inputs.find(event=>event.assetId===receipt.assetId);expect(input).toBeDefined();
  expect(input.schemaVersion).toBe('1');expect(input.tenantId).toBe(tenant);
  const parser=await connect('docling-parser',8083),asset=await connect('asset-service',8081);
  const parsed=await request.post(`${parser}/internal/v2/parse`,{headers:{Authorization:`Bearer ${createHmac('sha256',credentials.WORKER_DB).update('atlas-docling-parser-v1').digest('hex')}`,'Content-Type':'application/pdf'},data:pdf,timeout:45000});
  expect(parsed.status()).toBe(200);const result=await parsed.json();
  expect(result.sourceSha256).toBe(createHash('sha256').update(pdf).digest('hex'));
  const ledger=new HarnessLedger(),staleFence=ledger.fence,stageKey=randomUUID();
  const body={inputEventId:input.eventId,correlationId:input.correlationId,sourceSha256:result.sourceSha256,attemptFence:staleFence,pageCount:result.pageCount,document:result.document,provenance:result.provenance};
  const stage=(payload:any,stageId:string,auth=identity())=>request.post(`${asset}/internal/v1/assets/${receipt.assetId}/parsed-stages`,{headers:{Authorization:`Bearer ${auth}`,'Idempotency-Key':stageId,'Content-Type':'application/json'},data:JSON.stringify(payload)});
  expect((await stage(body,randomUUID(),identity('wrong'))).status()).toBe(401);
  expect((await stage(body,randomUUID(),identity(undefined,'other-worker'))).status()).toBe(403);
  expect((await stage(body,randomUUID(),identity(undefined,undefined,'22222222-2222-4222-8222-222222222222'))).status()).toBe(404);
  expect([400,422]).toContain((await stage({...body,sourceSha256:'0'.repeat(64)},randomUUID())).status());
  const stale=await stage(body,randomUUID());expect(stale.status()).toBe(201);
  const fence=ledger.claim(),winner={...body,attemptFence:fence};
  const first=await stage(winner,stageKey);expect(first.status()).toBe(201);const staged=await first.json();
  // Simulate acknowledgement loss: retry byte-identical stage, not a new parse/key.
  const retry=await stage(winner,stageKey);expect(retry.status()).toBe(200);expect(await retry.json()).toEqual(staged);
  expect((await stage({...winner,document:{schemaVersion:'1',markdown:'conflict'}},stageKey)).status()).toBe(409);
  expect((await request.get(`${api}/api/v2/assets/${receipt.assetId}/parsed`,{headers:publicHeaders})).status()).toBe(404);
  expect(ledger.finish(staleFence,JSON.stringify({artifactId:(await stale.json()).artifactId}))).toBe(false);
  const outcome=JSON.stringify({eventId:randomUUID(),assetId:receipt.assetId,tenantId:tenant,schemaVersion:'2',occurredAt:new Date().toISOString(),correlationId:input.correlationId,outcome:'COMPLETED',inputEventId:input.eventId,artifactId:staged.artifactId});
  expect(ledger.finish(fence,outcome)).toBe(true);expect(ledger.finish(fence,outcome)).toBe(false);
  const publish=()=>kube(['exec','-i','statefulset/kafka','--','/opt/kafka/bin/kafka-console-producer.sh','--bootstrap-server','kafka-client:19092','--topic','asset.processed.v2'],{input:ledger.outcome+'\n',quiet:true,sensitive:true});
  publish();publish();
  await expect.poll(async()=>{const response=await request.get(`${api}/api/v1/assets/${receipt.assetId}`,{headers:publicHeaders});return (await response.json()).status;},{timeout:30000}).toBe('COMPLETED');
  const detail=await (await request.get(`${api}/api/v1/assets/${receipt.assetId}`,{headers:publicHeaders})).json();expect(detail.version).toBe(2);
  const copy=await request.get(`${api}/api/v2/assets/${receipt.assetId}/parsed?format=json`,{headers:publicHeaders});expect(copy.status()).toBe(200);expect(await copy.json()).toEqual(result.document);
  expect((await request.get(`${api}/api/v2/assets/${receipt.assetId}/parsed`,{headers:{Authorization:`Bearer ${native.token('b',directory)}`}})).status()).toBe(404);
  for(const name of ['asset-service','workspace-api','docling-parser']) {
   const original=before.find((d:any)=>d.metadata.name===name),current=deployments().find((d:any)=>d.metadata.name===name);
   expect(current.spec.template).toEqual(original.spec.template);expect(current.metadata.generation).toBe(original.metadata.generation);
  }
 } finally {
  for(const connection of connections)connection.close();
  kube(['scale','deployment/processing-worker',`--replicas=${worker.spec.replicas}`],{quiet:true});
  kube(['rollout','status','deployment/processing-worker','--timeout=120s'],{quiet:true});
 }
});
