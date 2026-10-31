import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validatePolicy,lex,inspectSource,inventory,evaluate,run} from './architecture-guardrails.mjs';

const policy=()=>({version:1,roots:['services'],files:{},providerContracts:[]});
const scan=(text,role='application',path='services/demo/application/Use.java')=>inspectSource(path,text,role);
const finding=()=>scan('import java.sql.Connection;')[0];
const entry=(f=finding())=>({...Object.fromEntries(['path','rule','hash'].map(k=>[k,f[k]])),count:1,owner:'owner',rationale:'migration',story:'LAB-107',reviewBy:'2026-11-30'});
const baseline=(entries=[],approval='owner-reviewed')=>({version:1,approval,entries});
const options={today:'2026-10-31'};
function fixture(fn) {
 const root=mkdtempSync(join(tmpdir(),'atlas-architecture-'));
 try {for(const p of ['services/demo/application','contracts/openapi','docs/architecture'])mkdirSync(join(root,p),{recursive:true});return fn(root,(p,s)=>writeFileSync(join(root,p),s));}
 finally {rmSync(root,{recursive:true,force:true});}
}
test('policy rejects unknown fields, versions, unsafe paths, duplicate roots, roles and contracts',()=>{
 assert.deepEqual(validatePolicy(policy()),policy());
 for(const p of [null,[],{...policy(),extra:1},{...policy(),version:2},{...policy(),roots:[]},{...policy(),roots:['../x']},{...policy(),roots:['/tmp']},{...policy(),roots:['services','services']},{...policy(),providerContracts:['x','x']},{...policy(),files:{x:'legacy'}}]) assert.throws(()=>validatePolicy(p));
});
test('comments, strings and text blocks cannot create executable import false positives',()=>{
 const text='// import java.sql.X;\n/* org.springframework.X */\nString a="java.net.http.HttpClient";\nString b="""\nsoftware.amazon.X\n""";';
 assert.equal(scan(text).length,0);
 assert.equal(lex('# import docling\nx="requests.Client"',true).literals.length,1);
 assert.equal(scan('# import docling\nx="requests.Client"','domain','services/demo/domain/a.py').length,0);
});
test('core rejects infrastructure, qualified calls, concrete DTOs and provider policy',()=>{
 assert.ok(inspectSource('a.java','OtherVendorAdapter.Result value;','port',['OtherVendorAdapter']).some(f=>f.rule==='CORE_ADAPTER_TYPE'));
 assert.ok(inspectSource('a.java','Vendor$Adapter.Result value;','port',['Vendor$Adapter']).some(f=>f.rule==='CORE_ADAPTER_TYPE'));
 for(const text of ['import org.springframework.stereotype.Component;','java.net.http.HttpClient.newHttpClient();','import software.amazon.awssdk.services.s3.*;','import java.nio.file.Files;','import dev.demo.adapters.HttpParser;','ParserClient.Parsed parse();','if (useDocling) {}','String x="DoclingDocument";','from docling.document_converter import DocumentConverter']) assert.ok(scan(text).length,text);
 for(const role of ['domain','application','port']) assert.ok(scan('import java.sql.Connection;',role).length);
 assert.equal(scan('record ParsedDocument(String text) {}','domain').length,0);
 for(const role of ['outbound','bootstrap']) assert.equal(scan('import java.sql.Connection; ParserClient.Parsed x; String s="SELECT * FROM x";',role).length,0);
});
test('SQL is rejected in inbound/core, including multiline literals; literal provider branches are data',()=>{
 for(const role of ['inbound','application']) {
  assert.ok(scan('db.queryForList(sql);',role).some(f=>f.rule==='PERSISTENCE_IN_POLICY_OR_INBOUND'));
  assert.ok(scan('String s="""\nSELECT * FROM checkpoint\n""";',role).some(f=>f.rule==='SQL_IN_POLICY_OR_INBOUND'));
 }
 assert.equal(scan('String example="if (useDocling) {}";').length,1); // provider literal, not a branch
 assert.equal(scan('String example="if (useDocling) {}";')[0].rule,'CORE_PROVIDER_LITERAL');
 assert.equal(scan('import java.sql.Connection;',null)[0].rule,'UNCLASSIFIED_SOURCE');
});
test('inventory classifies new layer files, fails new flat files and detects schema leakage',()=>fixture((root,write)=>{
 write('services/demo/application/Use.java','import java.sql.Connection;');
 write('services/demo/New.java','class New {}');
 write('contracts/openapi/demo.json',JSON.stringify({const:'DoclingDocument'}));
 let p=policy();let findings=inventory(root,p);
 assert.ok(findings.some(f=>f.rule==='UNCLASSIFIED_SOURCE'));
 assert.ok(findings.some(f=>f.rule==='PROVIDER_CORE_CONTRACT'));
 p.providerContracts=['contracts/openapi/demo.json'];assert.ok(!inventory(root,p).some(f=>f.rule==='PROVIDER_CORE_CONTRACT'));
 p.files={'services/demo/New.java':'outbound'};assert.ok(!inventory(root,p).some(f=>f.rule==='UNCLASSIFIED_SOURCE'));
 for(const [dir,role] of [['domain','domain'],['ports','port'],['bootstrap','bootstrap'],['adapters/in','inbound'],['adapters/out','outbound']]) {
  mkdirSync(join(root,'services/demo',dir),{recursive:true});write('services/demo/'+dir+'/X.java','class X {}');
 }
 mkdirSync(join(root,'services/demo/tests'));write('services/demo/tests/Bad.java','ignored');
 assert.ok(inventory(root,p).length);
 assert.throws(()=>inventory(root,{...p,files:{'missing.java':'domain'}}),/Missing/);
 write('outside.java','class X {}');assert.throws(()=>inventory(root,{...p,files:{'outside.java':'domain'}}),/outside roots/);
 symlinkSync(join(root,'outside.java'),join(root,'services/demo/Link.java'));
 assert.throws(()=>inventory(root,p),/symlinks/);
}));
test('ratchet detects new, duplicate, stale, changed, moved, expired and unapproved debt',()=>{
 const f=finding(),e=entry(f);
 assert.deepEqual(evaluate([],baseline(),options).errors,[]);
 assert.equal(evaluate([f],baseline([e]),options).errors.length,0);
 assert.ok(evaluate([f],baseline([e],'pending'),options).errors.length);
 assert.ok(evaluate([f],baseline([e,e]),options).errors.length);
 assert.ok(evaluate([],baseline([e]),options).errors.length);
 assert.ok(evaluate([f,f],baseline([e]),options).errors.length);
 assert.ok(evaluate([{...f,hash:'f'.repeat(64)}],baseline([e]),options).errors.length);
 assert.ok(evaluate([{...f,path:'services/new.java'}],baseline([e]),options).errors.length);
 assert.ok(evaluate([f],baseline([e]),{...options,strict:true}).errors.length);
 assert.equal(evaluate([f],baseline([e]),{today:'2026-11-30'}).errors.length,0);
 assert.ok(evaluate([f],baseline([e]),{today:'2026-12-01'}).errors.length);
 assert.ok(evaluate([f,f],baseline([{...e,count:2}]),options).errors.length===0);
 for(const change of [{count:0},{hash:'x'},{path:'../x'},{owner:''},{rationale:''},{story:'x'},{reviewBy:'2026-11-31'},{reviewBy:'2027-01-01'}]) assert.throws(()=>evaluate([f],baseline([{...e,...change}]),options));
 for(const b of [{...baseline(),version:2},{...baseline(),approval:'auto'},{...baseline(),extra:1}]) assert.throws(()=>evaluate([],b,options));
});
test('CLI/read-only inventory never rewrites baseline and check is fail closed',()=>fixture((root,write)=>{
 write('services/demo/application/Use.java','import java.sql.Connection;');
 write('docs/architecture/policy.json',JSON.stringify(policy()));
 const findings=inventory(root,policy());
 write('docs/architecture/debt-baseline.json',JSON.stringify(baseline(findings.map(entry),'pending')));
 assert.equal(run(root,'inventory'),0);
 assert.equal(run(root,'check'),1);
 assert.equal(run(root,'audit'),1);
 assert.throws(()=>run(root,'accept'));
 const tool=join(import.meta.dirname,'architecture-guardrails.mjs');
 for(const mode of ['check','audit','accept']) assert.equal(spawnSync(process.execPath,[tool,mode],{cwd:root}).status,1);
 assert.equal(spawnSync(process.execPath,[tool,'inventory'],{cwd:root}).status,0);
}));
