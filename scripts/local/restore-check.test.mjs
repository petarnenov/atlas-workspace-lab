import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileHash,restoreCheck,privateRun} from './restore-check.mjs';
test('restores only a verified snapshot into distinct containers, checks scoped endpoints and stops without deleting volumes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'atlas-restore-'));const files={};
 try {
  for(const file of ['assets.sql','worker_checkpoint.sql','storage.tar','asset-copies-snapshot.json']){writeFileSync(`${dir}/${file}`,'synthetic backup');files[file]=await fileHash(`${dir}/${file}`);}
  writeFileSync(`${dir}/snapshot-ready.json`,JSON.stringify({files}));
  const credentials={OBJECT_ADMIN:'a'.repeat(48),POSTGRES_ADMIN:'p',ASSET_DB:'a',WORKER_DB:'w',ASSET_OBJECT:'s',WORKER_OBJECT:'r'};
  const calls=[];let fail=false,wrongPort=false;
  const run=async(command,args,env,input)=>{
   calls.push({command,args,env,input});assert.match(env.ATLAS_COMPOSE_PROJECT,/^atlas-restore-/);assert.equal(env.ATLAS_POSTGRES_PORT,'0');assert.equal(env.ATLAS_STORAGE_PORT,'0');
   if(fail&&args.includes('up'))throw Error('fixture startup failure');
   if(args.includes('port'))return wrongPort?'0.0.0.0:12345':args.includes('postgres')?'127.0.0.1:25432\n':'127.0.0.1:29000\n';return '';
  };
  const owner=async(component,action,file,env)=>{assert.equal(component,'asset-service');assert.equal(action,'export');assert.equal(env.ASSET_DB_URL,'jdbc:postgresql://localhost:25432/assets');assert.equal(env.LAB_OBJECT_ENDPOINT,'http://localhost:29000');writeFileSync(file,'restored fixture');};
  const result=await restoreCheck(dir,credentials,owner,run);assert.match(result.project,/^atlas-restore-/);assert.ok(result.exported.startsWith(dir));assert.deepEqual(calls.at(-1).args,['compose','stop']);assert.ok(calls.some(call=>call.input?.endsWith('storage.tar')));assert.ok(calls.every(call=>!call.args.includes('down')));
  wrongPort=true;await assert.rejects(restoreCheck(dir,credentials,owner,run),/port/);assert.deepEqual(calls.at(-1).args,['compose','stop']);wrongPort=false;
  fail=true;await assert.rejects(restoreCheck(dir,credentials,owner,run),/startup/);assert.deepEqual(calls.at(-1).args,['compose','stop']);
  writeFileSync(`${dir}/assets.sql`,'tampered');const count=calls.length;await assert.rejects(restoreCheck(dir,credentials,owner,run),/integrity/);assert.equal(calls.length,count);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('private subprocess preserves binary stdin and bounds output/errors without dumping snapshot content',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'atlas-private-run-'));
 try {
  const file=join(dir,'input');writeFileSync(file,Buffer.from([0,1,2,255]));
  const code="let n=0;process.stdin.on('data',b=>n+=b.length);process.stdin.on('end',()=>process.stdout.write(String(n)))";
  assert.equal(await privateRun(process.execPath,['-e',code],process.env,file),'4');
  await assert.rejects(privateRun(process.execPath,['-e','process.exit(1)'],process.env),/Restore/);
  await assert.rejects(privateRun('/nonexistent-atlas-command',[],process.env),/unavailable/);
  await assert.rejects(privateRun(process.execPath,['-e',"process.stdout.write('x'.repeat(70000))"],process.env),/bound/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
