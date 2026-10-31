import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate} from './validate-asyncapi.mjs';
test('official validator accepts the event contract and rejects malformed/schema-invalid changes',async()=>{
const source=readFileSync('contracts/asyncapi/asset-events.v1.json','utf8');
assert.ok(await validate(source));
await assert.rejects(validate('{"asyncapi":"3.0.0","info":{}}'));
const modified=JSON.parse(source);modified.operations.workerReceiveUpload.action='unsupported';
await assert.rejects(validate(JSON.stringify(modified)));
});
