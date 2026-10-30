# Worker checkpoint design

Status: PROPOSED — pending exact-revision owner approval.

## Data and permissions

Run one PostgreSQL instance with separate asset and worker databases and roles.
Neither service receives the other's credentials. Revoke PUBLIC CONNECT on both
databases and grant connection only to their owner roles. Migration credentials
remain component-specific. Integration tests prove reciprocal access denial.
The worker gets an object-store policy permitting GetObject only within the
synthetic upload bucket; it cannot upload or delete objects.

Worker tables contain only synthetic event identifiers, the validated immutable
input envelope, content hash, processing state, attempt count, lease deadline,
next attempt time, exact output envelope, publication state and sanitized error.
No document bytes, parsed content, identity tokens or asset status projection.

## Input identity and concurrency

Validate the full AssetUploaded schema before creating a checkpoint. Unique
constraints cover eventId and (tenantId, assetId, correlationId). Repeated
identical input returns the retained checkpoint. Reused eventId with a different
envelope or a second inconsistent input for the asset is quarantined without
processing or a new outcome. Record only sanitized reason and event identifiers.

Use a single-row database lease and a monotonically increasing fencing token.
Only the current lease holder can persist an outcome. A lease lasts 60 seconds;
parser deadline is 10 seconds. Heartbeat/lease renewal must stop on ownership
loss. An expired lease can be recovered after restart. All updates check the
fencing token so a stale worker cannot replace a newer attempt's result.

## Processing and publication

Persist input before acknowledging Kafka input. A durable scanner recovers ready
or expired checkpoints without depending on Kafka redelivery. Use at most three
processing attempts, with 1s and 2s backoff for transient storage failures.
Malformed/encrypted/unsupported PDF inputs immediately produce INVALID_DOCUMENT;
a parser timeout/abnormal exit produces PROCESSING_ERROR. Transient exhaustion
produces RETRY_EXHAUSTED. Outcomes match existing AssetProcessed exactly.

Persist terminal outcome and its generated eventId atomically, before sending.
Publish with Kafka key assetId and wait for acknowledgement before marking sent.
An acknowledgement lost during a crash can cause duplicate Kafka records; every
republication uses the SAME eventId and payload. Asset-service applies the
outcome transactionally and idempotently. This is at-least-once delivery, not
exactly-once Kafka publication. No non-idempotent external processing effects
are permitted. Parser execution can repeat after an interrupted attempt.

Publisher makes three bounded attempts with 1s/2s backoff per delivery cycle,
then retains the outcome in inspectable exhausted state. The operator may retry
the same outcome; no new outcome identity or document processing is generated.
A failed database write never permits acknowledgement based on volatile state.

## Retention and reconciliation

Configure local Kafka topic retention to seven days. Retain compact worker
terminal identity/outcome checkpoints for the entire lifetime of local demo
data; do not garbage-collect them automatically. Thus a manual Kafka replay
cannot resurrect effects merely because its deduplication row expired.
Explicit environment teardown removes both broker data and worker checkpoints.
Independent deletion/reset of either requires operator reconciliation before
resuming consumers. Never claim arbitrary historical replay after deletion is
safe. Asset metadata and consumer deduplication follow the same lifetime rule.

After 15 minutes without a terminal result, asset-service reconciliation may
make a PROCESSING asset FAILED/RETRY_EXHAUSTED, recording an audit reason.
An outcome arriving after that decision cannot change terminal status. Expired
worker leases are recoverable; exhausted publications remain inspectable.

## Rollback

Stop worker and dispatchers before rollback. Keep asset and worker databases,
objects and broker volumes. Roll back application artifacts without modifying
wire contracts; resume pending checkpoints only with a compatible schema.
Do not drop the checkpoint database or reset offsets as an automated rollback.
Local disposal is an explicit operator action and removes all coupled demo data.
