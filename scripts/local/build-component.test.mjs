import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from './build-component.mjs';
test('builds only selected deployable and rejects accidental shell or dependency builds',()=>{
 for(const name of ['workspace-api','asset-service','processing-worker','portal-ui','docling-parser']) {
  const calls=[];build(name,(command,args)=>{calls.push([command,args]);return {status:0};});assert.equal(calls.length,1);
  if(['workspace-api','asset-service','processing-worker'].includes(name))assert.deepEqual(calls[0],['./gradlew',[`:${name}:assemble`,'--no-daemon']]);
 }
 for(const name of [undefined,'postgres','../other','$(secret)'])assert.throws(()=>build(name,()=>{throw Error('must not execute');}));
 assert.throws(()=>build('asset-service',()=>({status:1})));assert.throws(()=>build('asset-service',()=>({error:Error('spawn')})));
});
