import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {workerIdentity,artifactPassword,localArtifacts} from './artifact-credentials.mjs';

test('worker identity is explicit, private, stable and rejects partial or mismatched pairs',()=>{
 const dir=mkdtempSync(join(tmpdir(),'atlas-worker-identity-'));
 try {
  assert.throws(()=>workerIdentity(dir),/missing/);
  const first=workerIdentity(dir,true);
  assert.equal(statSync(`${dir}/worker-private.pem`).mode&0o777,0o600);
  assert.deepEqual(workerIdentity(dir,true),first);
  rmSync(`${dir}/worker-public.pem`);assert.throws(()=>workerIdentity(dir,true),/Partial/);
  const other=workerIdentity(`${dir}/other`,true);
  writeFileSync(`${dir}/worker-public.pem`,other.publicKey);assert.throws(()=>workerIdentity(dir),/mismatch/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('derived writer credential is separate, repeatable and does not rotate existing environment secrets',()=>{
 const original=process.cwd(),dir=mkdtempSync(join(tmpdir(),'atlas-artifacts-'));
 try {
  process.chdir(dir);
  const admin='a'.repeat(48),password=artifactPassword(admin);
  assert.match(password,/^[a-f0-9]{64}$/);assert.notEqual(password,admin);
  assert.notEqual(password,artifactPassword('b'.repeat(48)));
  for(const invalid of [undefined,'', 'not-a-key'])assert.throws(()=>artifactPassword(invalid));
  writeFileSync('.env',`LAB_OBJECT_ADMIN_PASSWORD=${admin}`);
  localArtifacts();const source=readFileSync('.env','utf8');
  assert.equal(source,`LAB_OBJECT_ADMIN_PASSWORD=${admin}\nLAB_ARTIFACT_OBJECT_PASSWORD=${password}\n`);
  const key=workerIdentity('.local');localArtifacts();assert.equal(readFileSync('.env','utf8'),source);assert.deepEqual(workerIdentity('.local'),key);
  writeFileSync('.env',`LAB_OBJECT_ADMIN_PASSWORD=${admin}\nLAB_ARTIFACT_OBJECT_PASSWORD=existing-private-value\n`);
  localArtifacts();assert.ok(readFileSync('.env','utf8').includes('existing-private-value'));
  writeFileSync('.env','');assert.throws(()=>localArtifacts());
 } finally {process.chdir(original);rmSync(dir,{recursive:true,force:true});}
});
