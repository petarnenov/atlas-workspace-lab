# Design — revision 1

## Execution and ownership

Create docling-parser as an independently built Python HTTP service using official
Docling, with locked dependencies and image/model artifacts. A small restricted
adapter accepts PDF bytes; do not expose general-purpose URL/file conversion,
plugins, user-selected models or remote inference. Standard local PDF conversion,
OCR disabled for this initial text-PDF scope, no image descriptions or enrichment.
Scanned/image-only PDFs with no extracted content fail with PROCESSING_ERROR.
Evaluate synthetic layout/text fixtures; extracted content is untrusted data.

Worker retains event/checkpoint ownership and first runs all existing event,
object-reference and sandbox PDF validations. Invalid inputs never call Docling.
After validation, send the same bounded PDF bytes, never a storage URL/credential,
to the internal parser Service. Parser returns Markdown plus structured Docling
JSON, source SHA-256, actual package/model/pipeline version identifiers and page
count. Verify response schema, source hash, version identifiers and size before
accepting it. Do not claim the returned document text is sanitized for execution.

Store both formats in a worker-owned PostgreSQL parsed_document table, with
tenant_id, asset_id, input event ID, input hash and parser version metadata. Use
the existing worker DB credential and no direct cross-service table access.
Each asset has one committed immutable artifact for its accepted input. Artifact
insert and successful checkpoint outcome must share the same transaction and
fence/lease test: a stale attempt must commit neither. Only then publish the
existing COMPLETED outcome. Retrying a committed input returns the same artifact;
parser calls may repeat and no exactly-once inference claim is made.

## HTTP contract draft

Parser: POST /internal/v1/parse, Content-Type application/pdf, max 5 MiB.
Authorization: Bearer <dedicated ephemeral parser token>; constant-time comparison;
token mounted from Secret and never logged. Worker alone gets this credential.
Response 200 JSON: {sourceSha256, parserVersion, pipelineVersion, pageCount,
markdown, document}, document being the versioned Docling JSON object.
400 malformed PDF, 401 missing/invalid token, 413 input/output bounds exceeded,
422 unsupported/encrypted/over-page-limit PDF, 429 busy, 503 conversion failure.
Errors contain only fixed code and correlation ID; no exception text or content.
GET /health/live verifies HTTP process; GET /health/ready requires initialized
converter/artifacts. Health routes disclose no configuration or document data.

Worker: GET /internal/v1/assets/{assetId}/parsed?format=markdown|json, authenticated
with existing signed service identity conventions and explicit read audience/scope.
Tenant and subject must derive from verified identity, never plain request headers.
Return only matching tenant/asset data. Authorized absent/uncommitted copy: 404;
invalid auth: 401/403; cross-tenant lookup: 404. Successful content types text/markdown
or application/json, Cache-Control: no-store. No public worker ingress.

BFF: GET /api/v1/assets/{assetId}/parsed?format=markdown|json. Validate existing
user identity and enforce current asset access through the asset service before
calling the worker with the scoped identity. Preserve current status/errors;
no new asset-service database access or parser access from the browser.
Document additive operation and internal contracts as OpenAPI 3.1 before coding.
Existing AsyncAPI status/error vocabulary remains unchanged: parsing failures
map to PROCESSING_ERROR; transient exhaustion maps to RETRY_EXHAUSTED.

## Bounds, retries and storage

Max 20 pages, 5 MiB input and 10 MiB combined response. One active conversion per
parser pod; excess requests receive 429, no unbounded queue. Each conversion runs
in a disposable subprocess with a 40-second hard deadline and forced cleanup;
worker request deadline 45 seconds. Existing 60-second checkpoint leases require
fenced renewal while processing (every 15 seconds) and cancellation on lost lease;
persist only under a still-valid fence. Never extend another attempt's lease.
Retries reuse existing maximum of three processing attempts and exponential
backoff; parser timeout, 429/503 and transport failure are transient. Permanent
validation/size/format errors are terminal. Validate timings with failure tests.

Parser has no DB or storage credentials and no persistent documents. Private tmp
files are removed after success, failure and timeout; scratch size is bounded.
Worker artifacts survive pod restart in the existing PostgreSQL PVC. Synthetic
artifact retention matches demo asset lifetime; environment reset removes it.
No new user-facing deletion claim; future deletion must remove derived copies.
No document bodies, tokens, paths, tenant IDs or raw exceptions in logs. Emit
bounded parser_started/parser_saved/parser_retry events with validated opaque IDs.

## Kubernetes, Helm and Make

Dedicated docling-parser image, Deployment and ClusterIP Service, and independent
Helm application release in atlas-dev/atlas-prod. Exactly three replicas by default
in both profiles; preserve existing worker single replica and Kafka partition count.
Each pod: request 500m CPU/1 GiB RAM, limit 2 CPU/2 GiB RAM, bounded 256 MiB scratch,
non-root, read-only rootfs, dropped capabilities and no service account token.
Use a generous startup probe for local model initialization; readiness gates
traffic. State resource requirements in doctor/runbook; do not silently scale down
when the local cluster has insufficient capacity. One worker schedules conversion
serially, so three parser pods provide spare capacity, not promised 3x throughput.

Default-deny network policies allow only worker-to-parser and authorized
BFF-to-worker retrieval, plus required existing DB/DNS connections. Parser has no
runtime internet egress; package/model artifacts are pinned, verified and included
at build time. No download-on-first-request or cloud dependency.

Extend existing Make entry points: helm-build and helm-deploy accept
ENV=dev|prod SERVICE=docling-parser for independent build/deploy; retain full-env
build/deploy. Include parser in setup/doctor/status/logs/security and native/local
runtime parity where those workflows run the processing happy path.
New make parsed-copy ENV=dev ASSET_ID=<uuid> FORMAT=markdown|json (default markdown)
uses the existing demo identity/token mechanism and authorized BFF endpoint,
prints content to stdout and exits nonzero on errors. Validate args and avoid
printing tokens. Demo prod supports the same command. No implicit upload or
reprocessing by the read command. Runbook explains upload -> completion -> read.

## Exception, rollout and rollback

Technology exception owner: repository owner. Scope: Python and its locked
Docling dependencies only in docling-parser and its tests/build; Java services
remain Java. Rationale: official document-conversion runtime. Approval evidence:
conversation “Разрешаваме Python за този тук”. Update technology policy/checks
narrowly after specification approval. Review before LAB-106 merge and whenever
parser runtime/dependency/model versions change. No exception to tenant/security
or review principles. Initial quality gates use fixed synthetic expected text,
reading order and table structure fixtures, failure/security cases and independent
expected outputs; do not grade outputs solely with the converter itself.

Roll out parser first, then worker and BFF; existing stored assets are not
automatically reparsed. Prove a synthetic upload and parsed-copy retrieval.
Rollback worker/BFF then parser; retain additive artifact table and data for
inspection. Never delete stored artifacts during normal deploy/rollback. Removing
the Python exception requires removing the parser feature or a new approved
replacement. Human PR review and passing CI required; no automatic merge.

Sources consulted: https://github.com/docling-project/docling and
https://github.com/docling-project/docling-serve . Actual dependency/model versions
and hashes must be recorded and security-checked before the feature is accepted.
