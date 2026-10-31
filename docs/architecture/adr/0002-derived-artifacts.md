# ADR-0002 — Replaceable derived-artifact persistence

Status: ACCEPTED — revision 1, commit f737615; owner approval recorded in LAB-107 approval.md. Story: LAB-107.
Depends on ADR-0001; applies P02/P03/P05–P10/P12/P15/P16/P18–P20.

## Context

LAB-106 stores Markdown and Docling JSON in the worker checkpoint database.
The shared transaction provides atomicity but binds content, execution state and
retrieval lifecycles. PostgreSQL is not inherently unsuitable for documents;
the missing storage boundary and lifecycle decision are the defect.

## Decision

Put artifact content behind application-owned ArtifactStore. The target initial
adapter uses the existing S3-compatible object store. PostgreSQL retains manifests,
checksums, source identity, artifact/schema versions, opaque references, checkpoint
and publication state as appropriate within each owning domain. Native provider
output can be an additional artifact, not a required domain representation.

Ownership includes authorization, reads, retention/deletion and versioning. The
checkpoint component does not implicitly become owner of those responsibilities.
The migration design must choose the owning domain capability and API explicitly;
co-location with an existing service is allowed. No new microservice, credentials,
bucket permissions or worker write access is authorized by this ADR. The existing
source-PDF ObjectsStore has a fixed bucket, PDF media type and 5 MiB bound: it is
not automatically appropriate for derived formats with different limits.

## Consistency and migration gates

There is no shared object-store/PostgreSQL transaction. Write immutable content
under attempt/version-safe identifiers, verify acknowledged content/checksum,
then commit authorized references and completion/publication state under valid
ownership/fencing. Expose committed references only; publish COMPLETED only after
durable content and required metadata commit. Stale attempts cannot overwrite or
delete the winner. Define retry/lost-ack semantics and bounded, ownership-aware
orphan reconciliation. If metadata belongs to another service, define its API and
idempotency/acknowledgement protocol, not an imaginary cross-service transaction.

A separate approved change must cover domain ownership, contracts, permissions,
existing-row migration, verification, retention and rollback. Keep old copies until
verified and rollback-safe. This change does not migrate or delete data.

## Alternatives and verification

PostgreSQL content behind an ArtifactStore adapter remains possible with explicit
capacity/lifecycle rationale. Direct SQL provides local atomicity but no storage
substitutability. Object storage separates lifecycles but needs crash recovery.
Moving an INSERT to S3 alone would lose the current guarantee.

All implementations satisfy shared put/read, tenant isolation, immutability,
idempotency, integrity and error contract tests. Test the real selected engine,
crash-after-write, commit failure, stale lease, lost acknowledgement, missing/
corrupt object, authorized reads and rollback. Preserve bounds and log redaction.
Owner: repository owner. Review exact revision 1 and any ownership/security change.

## Owner clarification: minimal reusable contracts

Owner approved revision 1 and required minimal contracts for broad reuse. Include
only fields/operations necessary for the capability and its safety guarantees.
Keep provider options, deployment topology and transport types out of core ports.
Keep provenance as generic metadata; do not make Docling/native output mandatory.
Worker substitution must preserve events, identity, fencing/idempotency, retry and
completion semantics, without changes to other components. Configuration/deployment
and reviewed state migration may still be required. Breaking contract changes
need compatibility/versioning review. Minimal does not remove tenant/integrity or
failure semantics. This clarification does not authorize runtime contract changes.
