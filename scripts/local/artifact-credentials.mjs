import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {generateKeyPairSync,createPublicKey,createHmac} from 'node:crypto';

export function workerIdentity(directory,create=false) {
  const paths=['private','public'].map(kind=>`${directory}/worker-${kind}.pem`);
  const present=paths.map(path=>existsSync(path));
  if(present.some(Boolean)&&!present.every(Boolean))throw Error('Partial worker identity; restore matching keys');
  if(!present.some(Boolean)) {
    if(!create)throw Error('Worker identity missing; run setup');
    mkdirSync(directory,{recursive:true,mode:0o700});
    const pair=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
    writeFileSync(paths[0],pair.privateKey,{mode:0o600});writeFileSync(paths[1],pair.publicKey,{mode:0o600});
  }
  const privateKey=readFileSync(paths[0],'utf8'),publicKey=readFileSync(paths[1],'utf8');
  if(createPublicKey(privateKey).export({type:'spki',format:'pem'})!==createPublicKey(publicKey).export({type:'spki',format:'pem'}))throw Error('Worker identity mismatch');
  return {privateKey,publicKey};
}
export function artifactPassword(admin) {
  if(!/^[a-f0-9]{48}$/.test(admin??''))throw Error('Valid existing environment credential required');
  return createHmac('sha256',admin).update('atlas-derived-object-writer-v1').digest('hex');
}
export function localArtifacts() {
  const source=readFileSync('.env','utf8');
  if(!/^LAB_ARTIFACT_OBJECT_PASSWORD=/m.test(source)) {
    const admin=source.match(/^LAB_OBJECT_ADMIN_PASSWORD=([a-f0-9]{48})$/m)?.[1];
    writeFileSync('.env',source+(source.endsWith('\n')?'':'\n')+`LAB_ARTIFACT_OBJECT_PASSWORD=${artifactPassword(admin)}\n`,{mode:0o600});
  }
  workerIdentity('.local',true);
}
