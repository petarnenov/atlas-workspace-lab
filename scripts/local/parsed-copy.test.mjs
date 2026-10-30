import {test} from 'node:test';
import assert from 'node:assert/strict';
import {argumentsFor} from './parsed-copy.mjs';
test('parsed copy command validates environment, canonical ID, format and tenant',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal(argumentsFor('dev',id),`/api/v1/assets/${id}/parsed?format=markdown`);
 assert.equal(argumentsFor('prod',id,'json','b'),`/api/v1/assets/${id}/parsed?format=json`);
 for(const args of [['other',id],['dev','$(secret)'],['dev',id,'html'],['dev',id,'json','other']])assert.throws(()=>argumentsFor(...args));
});
import {EventEmitter} from 'node:events';
import {main,forward} from './parsed-copy.mjs';
import {createServer} from 'node:http';
test('reads authorized saved copy and cleans owned connection on success and HTTP failure',async()=>{
 let status=200,closed=0,output='';
 const server=createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer synthetic');res.writeHead(status);res.end('Saved text');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const dependencies={forward:()=>({ready:Promise.resolve(server.address().port),close:()=>closed++}),issue:()=> 'synthetic',request:fetch,write:value=>output+=value};
 try {
  const id='11111111-1111-4111-8111-111111111111';
  await main('dev',id,'markdown','a',dependencies);assert.equal(output,'Saved text\n');assert.equal(closed,1);
  status=404;await assert.rejects(main('dev',id,'json','a',dependencies),/HTTP 404/);assert.equal(closed,2);assert.equal(output,'Saved text\n');
  dependencies.request=async()=>{throw Error('network unavailable');};await assert.rejects(main('dev',id,'json','a',dependencies));assert.equal(closed,3);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('forward waits for allocated loopback port and rejects startup failures',async()=>{
 for(const mode of ['ok','exit','error','timeout']){
  const child=new EventEmitter();child.stdout=new EventEmitter();let killed=false;child.kill=()=>{killed=true;};
  const conn=forward('dev',(_cmd,args)=>{assert.ok(args.includes(':8080'));queueMicrotask(()=>{if(mode==='ok')child.stdout.emit('data','Forwarding from 127.0.0.1:23456 -> 8080');else if(mode!=='timeout')child.emit(mode);});return child;},()=>{},10);
  if(mode==='ok')assert.equal(await conn.ready,23456);else await assert.rejects(conn.ready);
  conn.close();assert.ok(killed);
 }
});
import {parserCredentials} from './parser-credentials.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('Compose parser credential is domain separated and private, without changing existing DB state',()=>{
 const original=process.cwd(),directory=mkdtempSync(join(tmpdir(),'atlas-parser-credential-'));
 try {
  process.chdir(directory);mkdirSync('.local');writeFileSync('.env','LAB_WORKER_DB_PASSWORD=synthetic-fixture-password\n');
  parserCredentials();const token=readFileSync('.local/parser-token','utf8');assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal(statSync('.local/parser-token').mode&0o777,0o600);assert.equal(statSync('.local/parser.env').mode&0o777,0o600);
  parserCredentials();assert.equal(readFileSync('.local/parser-token','utf8'),token);assert.equal(readFileSync('.env','utf8'),'LAB_WORKER_DB_PASSWORD=synthetic-fixture-password\n');
  writeFileSync('.env','');assert.throws(()=>parserCredentials());
 } finally {process.chdir(original);rmSync(directory,{recursive:true,force:true});}
});
