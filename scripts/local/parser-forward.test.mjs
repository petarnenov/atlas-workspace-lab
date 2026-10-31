import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import {PassThrough} from 'node:stream';
import {startForward} from './parser-forward.mjs';
test('local bridge relays authenticated HTTP using fixed argv and closes its child',async()=>{
 let killed=false;
 const server=startForward(0,(command,args)=>{
  assert.equal(command,'docker');assert.deepEqual(args,['exec','-i',`${process.env.ATLAS_COMPOSE_PROJECT??'atlas-lab'}-docling-parser-1`,'/app/.venv/bin/python','/app/stdio_bridge.py']);
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.kill=()=>{killed=true;};
  child.stdin.once('data',data=>{assert.match(data.toString(),/Authorization: Bearer synthetic/i);child.stdout.end('HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nSaved');});return child;
 });
 await once(server,'listening');
 try {const r=await fetch(`http://127.0.0.1:${server.address().port}/internal/v1/parse`,{headers:{Authorization:'Bearer synthetic'}});assert.equal(await r.text(),'Saved');}
 finally {await new Promise(resolve=>server.close(resolve));}
 for(let i=0;i<20&&!killed;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(killed);
});
