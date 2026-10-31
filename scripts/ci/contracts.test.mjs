import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
const load=file=>JSON.parse(readFileSync(file,'utf8'));
const ajv=new Ajv({strict:false});formats(ajv);
const id='00000000-0000-4000-8000-000000000001';
const native={mediaType:'application/json',content:{vendor:'opaque'}};
const validResult={sourceSha256:'a'.repeat(64),pageCount:1,
 document:{schemaVersion:'1',markdown:'synthetic'},provenance:{converter:'test-1',pipeline:'test-1'}};

test('neutral parser contract needs no provider result and rejects malformed values',()=>{
 const schema=load('contracts/openapi/parser-internal.v2.json').components.schemas.ParseResult;
 const validate=ajv.compile(schema);
 assert.equal(validate(validResult),true);
 assert.equal(validate({...validResult,native}),true);
 for(const value of [{...validResult,pageCount:21},{...validResult,pageCount:1.5},
  {...validResult,sourceSha256:'invalid'},{...validResult,document:{schemaVersion:'2',markdown:'x'}},
  {...validResult,document:{schemaVersion:'1',markdown:''}},{...validResult,providerOption:true}])
  assert.equal(validate(value),false);
});
test('staging contract binds immutable work identity and portable document',()=>{
 const post=load('contracts/openapi/artifact-internal.v1.json').paths['/internal/v1/assets/{assetId}/parsed-stages'].post;
 const validate=ajv.compile(post.requestBody.content['application/json'].schema);
 const body={...validResult,inputEventId:id,correlationId:id,attemptFence:1};
 assert.equal(validate(body),true);
 for(const patch of [{attemptFence:0},{inputEventId:'invalid'},{correlationId:null},{tenantId:id},{objectKey:'https://invalid.test'}])
  assert.equal(validate({...body,...patch}),false);
 assert.ok(post.parameters.some(p=>p.name==='Idempotency-Key'&&p.required));
});
test('processed v2 binds artifacts to successful outcomes and failures to error codes',()=>{
 const schema=load('contracts/asyncapi/asset-events.v2.json').components.messages.AssetProcessed.payload;
 const validate=ajv.compile(schema);
 const event={eventId:id,assetId:id,tenantId:id,schemaVersion:'2',occurredAt:'2026-10-31T00:00:00Z',
 correlationId:id,inputEventId:id,outcome:'COMPLETED',artifactId:id};
 assert.equal(validate(event),true);
 for(const patch of [{artifactId:undefined},{inputEventId:undefined},{errorCode:'PROCESSING_ERROR'},
  {schemaVersion:'1'},{objectKey:'forbidden'}])assert.equal(validate({...event,...patch}),false);
 const failed={...event,outcome:'FAILED',artifactId:undefined,errorCode:'PROCESSING_ERROR'};
 assert.equal(validate(failed),true);
 assert.equal(validate({...failed,artifactId:id}),false);
});
