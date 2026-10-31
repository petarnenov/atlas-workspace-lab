# Contract review — revision 1

These are proposed versioned wire shapes, not active API changes. Before runtime
implementation, encode them in OpenAPI 3.1/AsyncAPI 3, validate schemas and test
consumer/provider expectations. Any field/security/ownership change from this
reviewed revision needs another review. UUIDs are canonical; hashes are lowercase
SHA-256; tenant scope comes from verified identity, never an untrusted selector.
All bodies are bounded to 10 MiB combined UTF-8 bytes; input PDFs to 5 MiB.

## Neutral document and parser

ParsedDocument v1 JSON: exactly `{schemaVersion: "1", markdown: string}` with
nonempty Markdown. This is a minimal portable parsed-text representation, not a
claim to preserve provider-specific layout graphs. Add richer structure later
only with a real consumer and compatible versioning review.

`POST /internal/v2/parse` consumes application/pdf and returns JSON with required
`sourceSha256`, `pageCount` (1..20), `document` (ParsedDocument v1), `provenance`
(bounded opaque converter/pipeline revision strings). Optional `native` is an
opaque `{mediaType, content}` artifact; no required Docling keys/provider options
in the neutral response. Docling adapter validates native schema/version locally.
Existing provider-specific `/internal/v1/parse` remains during rollout.
Use current dedicated workload credential, one active conversion/pod, existing
deadline and secret-redaction rules. Errors preserve 400/401/413/422/429/503
semantics; untrusted responses, checksum mismatch, oversize or empty text fail.

## Staging and processed outcome

Asset-owned `POST /internal/v1/assets/{assetId}/parsed-stages` consumes JSON:
`inputEventId`, `correlationId`, `sourceSha256`, `attemptFence` (positive integer),
`pageCount`, `document`, `provenance`, optional `native`. A mandatory UUID
`Idempotency-Key` is durably fixed per worker attempt before external writes.
Returns 201 on first stage or 200 for identical retry: `{artifactId: uuid}`.
Tenant/subject are authenticated; asset ownership and input correlation are checked.
Same key/different bytes returns 409; invalid scope 403 or non-disclosing 404;
unavailable/limit exhaustion 503, oversized 413, invalid payload 400/422.
The artifact ID resolves an immutable verified manifest, not a storage address.

Processed event v2 uses a separate `asset.processed.v2` topic. Required existing
envelope fields: eventId, assetId, tenantId, schemaVersion ("2"), occurredAt,
correlationId, outcome. Add `inputEventId` to bind staging to the accepted upload.
COMPLETED requires exactly one `artifactId`; FAILED requires an existing sanitized
errorCode and forbids artifactId. No object keys, document content, provider fields,
credentials or processing implementation names. Event IDs and payload are stable
across publication retry; conflicting duplicates cannot change a terminal result.
Worker alone produces outcomes; asset-service alone publishes their visible state.
Uploaded v1 and processed v1 schemas are unchanged, retained for compatibility.

## Read APIs and v1 compatibility

Asset-owned `/internal/v2/assets/{assetId}/parsed` and BFF
`/api/v2/assets/{assetId}/parsed` support `format=markdown|json`; default markdown.
200 yields text/markdown or ParsedDocument v1 application/json, Cache-Control
no-store. Errors: 400 malformed request, 401 invalid identity, 403 unauthorized
scope, non-disclosing 404 missing/uncommitted/cross-tenant resource, 503 unavailable
or corrupt content. BFF reauthorizes through asset-service; a dedicated read
workload audience is validated by asset-service on every read.

Existing public/worker v1 paths remain available during migration. New asset-owned
v1 compatibility read serves byte-preserved Markdown/native JSON with the original
authorization/error behavior. BFF routes only after verified migration; old worker
read stays until rollback is proven. Existing FORMAT=json therefore does not
silently change representation. The v2 API and Make v2 default read are portable.

Native JSON is an explicit optional legacy capability. Replacing Docling without
that capability preserves v2 behavior, but cannot preserve provider-native v1 JSON.
Do not advertise transparent v1-native compatibility: migrate those clients first
or retain a compatible adapter. Standard worker/parser/storage substitution must
preserve all required neutral contracts without other components' source changes.

## Permissions and configuration

Keep source worker access read-only. Only asset-service has scoped derived-bucket
write/read permission; maintenance deletion uses an explicit separate binding.
New staging identity audience `asset-artifact-write` is worker-only; derived read
audience `asset-artifact-read` is BFF-only. Credentials are ephemeral demo Secrets,
not user tokens; enforce signature/issuer/audience/expiry/tenant/subject. Reject
unknown audiences, replay under another asset/tenant, arbitrary URLs/keys and
unapproved network egress. Asset-service may reach existing object storage;
worker may reach only the artifact API in addition to current allowed dependencies.
No parser DB/storage access or runtime internet access. Dev/prod-demo credentials,
namespaces and references cannot cross environments.
