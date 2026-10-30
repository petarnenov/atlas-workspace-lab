# LAB-101 — Worker-owned durable checkpoint

Status: PROPOSED; owner approval required before implementing this addition.
Issue: https://github.com/petarnenov/atlas-workspace-lab/issues/2
Baseline approval: https://github.com/petarnenov/atlas-workspace-lab/pull/3#issuecomment-6523638225

## Problem

The approved design requires consumers to store processed event IDs, bounded
retries and prevention of duplicate side effects. The worker must retain its
exact outcome across a crash between Kafka publication and offset commit.
The baseline assigns PostgreSQL to asset metadata/status and does not explicitly
assign durable worker checkpoint storage. Reading or writing the asset-service
schema would violate P02 and the handoff's mandatory ownership invariant.

## Proposed ownership addition

Use the existing local PostgreSQL instance with a separate `worker_checkpoint`
database, a separate worker-only role and no privileges on the asset database.
The asset-service remains the exclusive owner of asset metadata/status/outbox.
The worker owns only its input deduplication, processing leases, retry state,
immutable outcome and publication checkpoint. No new runtime dependency,
HTTP endpoint, Kafka topic or event field is introduced.

This follows P02's permission for shared infrastructure with separate schemas
and credentials. It is proposed for explicit review because the handoff requires
review before changing architectural ownership, and the approved design did not
name this worker-owned persistent store. This is not a principle exception.

## Scope and alternatives

A private database on the approved PostgreSQL instance is preferred over a new
embedded database dependency or a bespoke crash-safe filesystem journal.
Kafka producer idempotence alone does not retain application processing state
across arbitrary replay and process restart. Memory-only deduplication cannot
meet restart recovery scenarios.

Review this proposal, design, specification, tasks and the execution decisions
under `docs/architecture/lab-101-execution-decisions.md` as one revision. The
original OpenAPI/AsyncAPI files remain unchanged. No feature implementation or
production-readiness claim is included in this change.

Applicable principles: P02, P03, P05–P10, P12, P15–P20.
