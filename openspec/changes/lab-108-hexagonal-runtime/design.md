# Design — revision 1

## Dependency direction and complete scope

Use component-local domain/application/ports/adapters/in/adapters/out/bootstrap
packages. Dependencies point inward. Bootstrap is the only binding location;
missing/unknown bindings fail startup. Spring, Kafka, JDBC, HTTP, object SDKs,
filesystem, JSON codecs and provider schemas stay in adapters. No shared domain
kernel or service-private imports. Share transport/security utilities only when
they implement the same established contract, without moving domain ownership.

| Existing area | Required extraction and preserved behavior |
| --- | --- |
| Assets / AssetEvents / AssetHttp | Upload, asset query and outcome use cases; application-owned persistence/source-store ports; thin HTTP/Kafka adapters; preserve upload intent, advisory ownership, idempotency, lost-commit acknowledgement handling, compensation, asset state and deduplication |
| WorkerEvents / Checkpoints | Processing, claim/renew/finalize and publication use cases; execution-state and event-publication ports; JDBC transactional adapter and Kafka/scheduler adapters; preserve fencing, cancellation, stable payloads, retries and leases |
| ParserClient / PdfProbe / Sandbox | DocumentParser, validated source and sandbox ports; transport/process adapters map neutral results/errors; provider versions and schema checks outside core |
| ParsedHttp / ParsedProxy / WorkspaceHttp | Asset-authorized read use case in asset-service, thin BFF/HTTP adapters, compatibility routing; no SQL or provider policy in controllers |
| Identity / PdfUpload / Wire | Neutral validated identity/upload/event values separated from JWT/HTTP/JSON codecs and SDK dependencies; tenant policy stays with its owner, wire compatibility remains tested |
| Docling Python service | Pure conversion application boundary, provider adapter, thin authenticated transport/bootstrap; Python exception does not permit provider policy in Java core |

Do not relabel existing mixed classes as outbound to make the scanner pass.
Interfaces require real consumers, bindings and substitution tests. Repository
ports express domain transactions, not a generic CRUD/SQL callback abstraction.
Clock/identifier suppliers exist only where deterministic behavior needs them.

## Minimal kernel ports

DocumentParser accepts validated PDF bytes and returns source hash, page count,
neutral ParsedDocument and opaque provenance. It has no endpoint, token, HTTP,
Docling type, provider flag or deployment parameter. Parser failures distinguish
permanent rejection, transient unavailability and cancellation.

ArtifactStore is owned by the asset artifact application. Its required operations
are immutable put-if-absent and verified read using authorized tenant scope and
opaque reference. A maintenance-only deletion capability is separate from normal
read/write bindings. Results carry integrity/length/media type; opaque references
never encode a caller-selected URL. Content types/limits are domain-approved.

ExecutionState owns accept/claim/renew/fenced-finalize and durable publication
state. Domain values describe work, lease/fence and completed result reference;
no parser DTO, DB transaction or broker acknowledgement enters its contract.
Source acquisition, artifact staging and event publication are separate ports
with actual use-case consumers. Exact application types are translated to the
reviewed wire contracts at adapter boundaries.

## Artifact ownership and consistency

Asset-service owns source metadata/ACL and the derived-artifact lifecycle, including
tenant authorization, immutable content, manifests, publication and maintenance.
Use a separate derived bucket in existing RustFS. Only asset-service receives its
scoped derived writer credential; worker retains read-only source access and gains
only authenticated staging API access. Parser receives neither DB nor storage
credentials. Metadata is in asset-owned PostgreSQL tables; content is not in the
worker checkpoint table. No direct cross-service data access.

1. Worker validates event, source reference, source bytes and sandbox PDF checks
   before invoking DocumentParser. Preserve 5 MiB/20-page input, 10 MiB combined
   output, OCR-off behavior and existing 40/45-second conversion deadlines.
2. Under renewable ownership, worker stages the result through asset-service.
   Asset-service verifies identity, tenant/asset/correlation/source binding and
   limits, writes attempt-scoped immutable objects, reads/verifies hashes, then
   commits a STAGED manifest. Lost acknowledgement is retried with the same key.
   STAGED content is never publicly readable.
3. Worker atomically finalizes its checkpoint and durable v2 outcome payload under
   its current lease/fence. A lost/stale lease cannot produce a committed outcome.
   Stage success alone does not mean worker completion or public asset completion.
4. Worker outbox publishes that exact outcome. Asset-service validates the matching
   staged reference, verifies durable content, and atomically commits its manifest,
   outcome dedup record and COMPLETED asset state. Missing/unavailable content
   causes retry, never a false COMPLETED. FAILED outcomes need no artifact.
5. Public reads authorize against the asset owner and resolve committed manifests
   only. Corruption/missing content fails closed with a sanitized unavailable
   response; no silent fallback to another tenant or parser invocation.

There is no distributed transaction. Crashes can leave hidden staged objects or
a completed worker with pending publication, both recoverable. Stage IDs are
immutable and tied to attempt/fence. A late losing attempt cannot overwrite,
publish or delete the winner. Event IDs/payloads remain stable on retries.
Different payload under the same idempotency key is a conflict.

No blind TTL deletion of staged artifacts: a durable unsent outcome may reference
one. Reconciliation initially runs in an explicit dev maintenance window with
processing/consumers paused and publication drained, using verified worker-ledger
and asset-manifest snapshots. Dry-run first; max 1,000 candidates/60 seconds per
batch; revalidate ownership/references before deletion; unknown/partial state is
retained. Never auto-delete committed content. Quotas/backpressure bound staging
growth; reaching the configured limit returns retryable unavailability. Document
and test exact limit settings before enabling writes. Tenant data persists until
explicit demo reset/approved maintenance; no production retention claim.

Alternatives: a separate artifact deployment is unnecessary; worker-hosted artifact
ownership keeps replacement coupled to execution lifecycle; PostgreSQL body storage
behind a port is possible but does not meet the requested lifecycle separation.
Asset ownership costs a staging protocol and event version, explicitly accounted
for above rather than pretending cross-service writes are atomic.

## Compatibility, migration and rollback

Use consumer-first rollout. Keep upload v1 and current processed v1 consumers
while adding v2. Drain old work before switching new worker production to v2;
do not dual-publish one outcome to both topics. Freeze legacy v1 JSON behavior:
it remains native JSON for existing/capable results. The new neutral JSON is v2,
never silently substituted under v1. See contracts.md for capability limits.

Migration is an explicit Make command, never startup DDL/backfill with deletes.
Pause new uploads/claims, drain in-flight processing/publications, take restorable
DB/object snapshots, and export legacy rows through a worker-owned migration
adapter. Import through the asset-owned migration application; no asset-service
SQL against worker tables. Export includes tenant/asset/event/correlation/source
hash, versions, page count, original native JSON and Markdown checksums. Validate
against authoritative asset metadata; conflicting/missing bindings are quarantined.

For each row, write immutable content, verify byte lengths/hashes and commit a
manifest idempotently. Preserve original v1 bytes and derive v2 neutral content;
never reparse historical documents. Check per-tenant counts and checksums and
replay the migration to prove no duplicates. Old COMPLETED assets without copies
still return 404; never silently backfill them.

Retain original tables/snapshots throughout review and rollback verification.
Before accepting new-format writes, demonstrate rollback of new manifests and
outcomes through a reviewed export/import compatibility path into the old worker
reader/state format. Rollback pauses/drains the same way and restores routing
only after verification. If a chosen replacement cannot produce the legacy native
JSON needed by old clients, finish their v2 transition before enabling it; reject
that rollback plan rather than fabricate provider output or lose new documents.
No destructive table removal or artifact deletion in LAB-108.

## Delivery

Follow proposed ADR-0003. The specification branch is stacked on LAB-107 because
those guardrails are not yet on main; feature work must start from the reviewed
dev integration, not assume the governance PR merged. Keep task worktrees isolated.
All development uses ENV=dev; complete applicable checks locally before dev merge.
Configure hosted CI for same-repository dev-to-main promotion only, with actual
required jobs before human merge. Do not merge or modify protections automatically.
