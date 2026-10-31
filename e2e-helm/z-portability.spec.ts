import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import * as runtime from '../scripts/helm/runtime.mjs';
import {token,execute} from '../scripts/k8s/runtime.mjs';
import {syntheticPdf} from '../e2e/fixtures/pdf';
import {forward} from '../scripts/local/parsed-copy.mjs';

test.use({baseURL:`http://127.0.0.1:${process.env.ATLAS_UI_PORT??5173}`});
test('alternate parser with no native artifact runs through unchanged worker, asset and BFF images',async({request})=>{
 test.setTimeout(600000);
 const kube=(args:string[],options?:any)=>runtime.kube('dev',args,options);
 const deployments=()=>JSON.parse(kube(['get','deployments','-o','json'],{quiet:true})).items;
 const before=deployments(),parser=before.find((d:any)=>d.metadata.name==='docling-parser');
 const fixture=readFileSync('services/docling-parser/tests/fixtures/neutral_http.py','utf8');
 const patch=[{op:'add',path:'/spec/template/spec/containers/0/command',value:['/app/.venv/bin/python','-c',fixture]}];
 let maintenance=false,connection:any;
 try {
  // Prove backup restoration and old-reader compatibility for new portable writes first.
  maintenance=true;execute('make',['artifacts-pause','ENV=dev'],{quiet:true});
  execute('make',['artifacts-snapshot','ENV=dev'],{quiet:true});
  execute('make',['artifacts-restore-check','ENV=dev'],{quiet:true});
  execute('make',['artifacts-migrate','ENV=dev'],{quiet:true});
  execute('make',['artifacts-migrate','ENV=dev'],{quiet:true});
  execute('make',['artifacts-verify','ENV=dev'],{quiet:true});
  const nativeLess=kube(['exec','statefulset/postgres','--','psql','-U','local_admin','-d','assets','-Atc',"SELECT count(*) FROM derived_artifact WHERE state='COMMITTED' AND native_hash IS NULL"],{quiet:true}).trim();
  if(nativeLess==='0')execute('make',['artifacts-rollback-copy','ENV=dev'],{quiet:true});
  else expect(()=>execute('make',['artifacts-rollback-copy','ENV=dev'],{quiet:true})).toThrow();
  execute('make',['artifacts-reconcile','ENV=dev'],{quiet:true});
  execute('make',['artifacts-resume','ENV=dev'],{quiet:true});maintenance=false;
  const originals=deployments();
  kube(['patch','deployment/docling-parser','--type=json','-p',JSON.stringify(patch)],{quiet:true});
  kube(['rollout','status','deployment/docling-parser','--timeout=120s']);
  connection=forward('dev');
  const api=`http://127.0.0.1:${await connection.ready}`;
  const headers={Authorization:`Bearer ${token('a',runtime.directory('dev'))}`};
  const accepted=await request.post(`${api}/api/v1/assets`,{headers:{...headers,'Idempotency-Key':randomUUID()},multipart:{file:{name:'synthetic.pdf',mimeType:'application/pdf',buffer:syntheticPdf()}}});
  expect(accepted.status()).toBe(202);const {assetId}=await accepted.json();
  await expect.poll(async()=>{const result=await request.get(`${api}/api/v1/assets/${assetId}`,{headers});return (await result.json()).status;},{timeout:80000}).toBe('COMPLETED');
  const neutral=await request.get(`${api}/api/v2/assets/${assetId}/parsed?format=json`,{headers});
  expect(await neutral.json()).toEqual({schemaVersion:'1',markdown:'Alternate converter saved document'});
  expect((await request.get(`${api}/api/v1/assets/${assetId}/parsed?format=json`,{headers})).status()).toBe(404);
  expect((await request.get(`${api}/api/v2/assets/${assetId}/parsed`,{headers:{Authorization:`Bearer ${token('b',runtime.directory('dev'))}`}})).status()).toBe(404);
  const after=deployments();
  for(const name of ['processing-worker','asset-service','workspace-api']) {
   const first=originals.find((d:any)=>d.metadata.name===name),last=after.find((d:any)=>d.metadata.name===name);
   expect(last.spec.template).toEqual(first.spec.template);expect(last.metadata.generation).toBe(first.metadata.generation);
  }
  const count=kube(['exec','statefulset/postgres','--','psql','-U','local_admin','-d','worker_checkpoint','-Atc',`SELECT count(*) FROM parsed_document WHERE asset_id='${assetId}'`],{quiet:true});expect(count.trim()).toBe('0');
  // A native-less provider is valid for v2 but must not fabricate output for old-reader rollback.
  maintenance=true;execute('make',['artifacts-pause','ENV=dev'],{quiet:true});
  execute('make',['artifacts-snapshot','ENV=dev'],{quiet:true});
  expect(()=>execute('make',['artifacts-rollback-copy','ENV=dev'],{quiet:true})).toThrow();
 } finally {
  connection?.close();
  if(maintenance)execute('make',['artifacts-resume','ENV=dev'],{quiet:true});
  kube(['patch','deployment/docling-parser','--type=json','-p',JSON.stringify([{op:'replace',path:'/spec/template',value:parser.spec.template}])],{quiet:true});
  kube(['rollout','status','deployment/docling-parser','--timeout=180s']);
 }
});
