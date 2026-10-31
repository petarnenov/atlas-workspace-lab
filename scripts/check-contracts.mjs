import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const openapi = JSON.parse(
  readFileSync("contracts/openapi/asset-api.v1.json", "utf8"),
);
const internal = JSON.parse(
  readFileSync("contracts/openapi/asset-internal.v1.json", "utf8"),
);
const asyncapi = JSON.parse(
  readFileSync("contracts/asyncapi/asset-events.v1.json", "utf8"),
);

assert.equal(openapi.openapi, "3.1.0");
assert.equal(openapi.info.version, "1.0.0");
assert.ok(openapi.paths["/api/v1/assets"].post);
assert.ok(openapi.paths["/api/v1/assets/{assetId}"].get);
assert.ok(openapi.paths["/api/v1/assets"].post.responses["202"]);
assert.deepEqual(openapi.components.schemas.AssetStatus.enum, [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);
assert.ok(openapi.paths["/api/v1/assets"].post.responses["413"]);
assert.ok(openapi.paths["/api/v1/assets"].post.responses["415"]);
assert.ok(openapi.paths["/api/v1/assets"].post.security?.length);

assert.equal(internal.openapi, "3.1.0");
assert.ok(internal.paths["/internal/v1/assets"].post.security?.length);
assert.ok(internal.paths["/internal/v1/assets/{assetId}"].get.security?.length);
assert.ok(internal.components.securitySchemes.serviceToken);
assert.equal(asyncapi.asyncapi, "3.0.0");
assert.equal(asyncapi.channels.assetUploaded.address, "asset.uploaded.v1");
assert.equal(asyncapi.channels.assetProcessed.address, "asset.processed.v1");
for (const [name, action] of Object.entries({
  assetServicePublishUpload: "send",
  workerReceiveUpload: "receive",
  workerPublishOutcome: "send",
  assetServiceReceiveOutcome: "receive",
})) {
  assert.equal(asyncapi.operations[name].action, action);
}
for (const [name, fields] of Object.entries({
  AssetUploaded: [
    "eventId",
    "assetId",
    "tenantId",
    "schemaVersion",
    "occurredAt",
    "correlationId",
    "objectKey",
  ],
  AssetProcessed: [
    "eventId",
    "assetId",
    "tenantId",
    "schemaVersion",
    "occurredAt",
    "correlationId",
    "outcome",
  ],
})) {
  const schema = asyncapi.components.messages[name].payload;
  for (const field of fields)
    assert.ok(
      schema.required.includes(field),
      name + ": missing required " + field,
    );
}
console.log(
  "Contract invariants passed; authoritative OpenAPI/AsyncAPI validators run as separate CI steps.",
);

for (const name of ['parser-internal','worker-internal']) {
 const api=JSON.parse(readFileSync('contracts/openapi/'+name+'.v1.json','utf8'));
 assert.equal(api.openapi,'3.1.0');assert.equal(api.info.version,'1.0.0');
 for(const [path,operations] of Object.entries(api.paths))for(const operation of Object.values(operations))
  if(path.startsWith('/internal/'))assert.ok(operation.security?.length);
}
assert.ok(openapi.paths['/api/v1/assets/{assetId}/parsed'].get.security?.length);
