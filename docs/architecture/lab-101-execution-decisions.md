# LAB-101 execution decisions

Issue: https://github.com/petarnenov/atlas-workspace-lab/issues/2

## Approval evidence and scope

The owner approved the public/internal OpenAPI and Kafka AsyncAPI scope in
https://github.com/petarnenov/atlas-workspace-lab/pull/3#issuecomment-6523638225
on 2026-10-30. The reviewed PR head was
`a6c6baee958100fc755ce4ca04f5e68b66592673`, merged as
`972e30668885205228faa4c421fe8cc05e9bf962`. The implementation handoff is
`47abb69`. Historical draft labels remain in the original review artifacts;
this evidence supersedes their original implementation-blocked status only
within the approved scope. Contracts must remain byte-for-byte unchanged.

Applicable principles: P01–P03, P05–P10, P12, P15–P20. AI capabilities and
production identity are out of scope. This is a synthetic local demonstration.

## Identity and tenant propagation

Use separate ephemeral RSA key pairs for fixture-to-BFF and BFF-to-asset tokens.
Only the offline fixture issuer has the fixture private key; only the BFF has
the service private key. Services verify RS256, exact issuer/audience, expiry,
not-before, subject and an allowlisted synthetic tenant UUID. Tokens live at
most five minutes; service tokens at most one minute. No public mint endpoint.
The UI receives an operator-issued fixture token; it never receives signing
keys. Forward a newly signed service token after validating the public token,
never the client's Authorization or tenant headers. Reject unknown tenants,
missing/invalid claims and wrong audiences. Asset reads query by BOTH tenant
and asset UUID; missing and other-tenant resources return the same 404.
Private network placement is a local simplification, not production trust.

## State and ordering

Asset service exclusively owns metadata, versions and status. Insert PENDING
at version 0 with an upload outbox record. When the dispatcher takes an upload
for publication, conditionally advance PENDING to PROCESSING, version +1,
in its database transaction. Commit this before sending to Kafka: a crash
leaves a durable unpublished outbox record that is retried. PROCESSING means
scheduled for processing, not a claim that the worker has started execution.
Only PROCESSING may become COMPLETED or FAILED, with one version increment.
Both terminal states are immutable. The dispatcher cannot regress a terminal
state. Kafka key is asset UUID. Consumers verify tenant, asset, correlation,
schema version, object key and event identity. Timestamps are audit data, not
ordering authority. A valid duplicate terminal event is a no-op. Conflicting
terminal outcomes are retained as a reconciliation finding and never overwrite
the first committed outcome. Unknown/stale/mismatched events have no authority.

## Idempotency

Asset service enforces optional Idempotency-Key (1–128 characters) scoped by
verified tenant and subject. Store SHA-256 of bytes and normalized media type
with the original PENDING receipt for 24 hours. Concurrent requests serialize
on this scope. Replay returns the original 202 receipt even after completion;
same key with different content returns 400 (existing contract), without writes
or publication. Once expired the key may create a new asset. Keys do not grant
read permission. Cleanup never deletes asset metadata or processing evidence.

## Object upload and compensation

Validate size (1..5 MiB), PDF extension, media type and magic before storage.
Use generated UUID keys independent of supplied filenames. Reserve an upload
intent in the asset-owned database before writing MinIO. Store immutable bytes,
then atomically insert metadata and outbox, closing the intent. A failed final
transaction triggers object deletion; retain the intent if deletion fails.
Reconciliation deletes expired uncommitted objects after checking no metadata
references them. A crash after object write is recoverable from the intent.
Do not publish when validation or storage fails. Object operations have bounded
timeouts. An idempotency reservation must be recovered after interrupted work.

## Worker safety, deduplication and retry

The worker reads only opaque immutable objects through its own read-only object
credential, never asset-service tables. Parse in a separate JVM with a fixed
heap and a hard wall-clock timeout; kill it on deadline. Do not render, execute
scripts, extract attachments or follow links. Reject encrypted/malformed files.
Bound pages and input bytes. Use three attempts with exponential backoff only
for transient object/broker errors. Permanent document errors immediately emit
FAILED/INVALID_DOCUMENT. Exhausted transient errors emit FAILED/RETRY_EXHAUSTED.

The worker needs durable deduplication of input event IDs and durable retention
of the exact outcome until Kafka acknowledges it. A process-local set cannot
satisfy this requirement across restarts. The approved documents do not yet
specify the ownership, storage, retention, recovery or operational lifecycle of
this worker checkpoint; see the review question below.

## Reconciliation and evidence

Asset service retains outbox attempts, last sanitized error and next-attempt
time. Retry publication three times, then retain an inspectable exhausted row;
never silently drop an event. Reconciliation marks stuck PROCESSING assets
FAILED/RETRY_EXHAUSTED only after a documented deadline and records the reason.
Late outcomes cannot resurrect them. Do not automatically replay exhausted rows
without an operator decision; a replay preserves event identity. Synthetic
objects/metadata and processing evidence are disposable local data, removed by
explicit Compose teardown. Logs contain IDs/codes, never bytes/tokens/content.

Required verification includes provider/consumer schemas, cross-tenant denial,
wrong-signer/audience/expiry tests, duplicate/conflicting outcomes, interrupted
upload compensation, broker outage/recovery, worker restart, parser timeout,
UI bounded polling, full E2E and measured >=75% source coverage. Local checks
are not CI/reviewer approval or production reliability evidence.

## Review question before feature implementation

Choose worker-owned durable checkpoint persistence. Candidate: a separate
PostgreSQL database and role on the already-approved local PostgreSQL instance,
with no access to asset-service data. This adds no runtime infrastructure, but
extends the approved persistent-data ownership model, which currently assigns
PostgreSQL to asset-service only. A local persistent journal would instead add
a filesystem recovery/lifecycle mechanism. Kafka transactions alone do not
deduplicate replayed inputs after lost acknowledgement without durable state.

Owner review must decide the checkpoint boundary, retention and recovery before
worker feature code. Do not silently implement cross-service table access or
claim an in-memory cache provides durable deduplication. If PostgreSQL worker
ownership is approved, specify a unique input event ID, immutable output event
ID/payload, publication state, exclusive processing lease, bounded retry state,
and retention at least as long as broker replay; test crashes before/after
publication and expiration of leases.
