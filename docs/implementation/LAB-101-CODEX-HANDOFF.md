# LAB-101 — Codex Implementation Handoff

**Issue:** https://github.com/petarnenov/atlas-workspace-lab/issues/2
**Approved spec PR:** https://github.com/petarnenov/atlas-workspace-lab/pull/3
**Implementation branch:** `feat/lab-101-implementation`
**Status:** READY FOR CODEX EXECUTION; not implemented.
**Languages:** TypeScript and Java only. No Python.

## Read first
1. `AGENTS.md` and `docs/architecture/principles.md` (P01–P21).
2. `openspec/changes/lab-101-asset-upload/proposal.md`
3. `openspec/changes/lab-101-asset-upload/design.md`
4. `openspec/changes/lab-101-asset-upload/specs/asset-processing/spec.md`
5. `openspec/changes/lab-101-asset-upload/tasks.md`
6. All `contracts/openapi/*.json` and `contracts/asyncapi/*.json`

## Codex task
Implement LAB-101 against the approved contracts, in small, independently testable increments. Do not change wire contracts or architectural ownership without a new spec review.

### Delivery order
1. Record precise low-level decisions under `docs/architecture/` for signed synthetic identity tokens, tenant context propagation, status transitions, Idempotency-Key storage/TTL, object upload compensation, and event ordering. If any decision alters approved trust boundaries or contracts, stop and request owner approval before coding.
2. Add local Docker Compose dependencies for PostgreSQL, Kafka and MinIO with non-production test credentials and health checks.
3. Implement Asset Service metadata and safe PDF upload (<=5 MiB, magic bytes, opaque generated storage path, tenant ownership). Implement transactional outbox, processing status, idempotency and tests.
4. Implement Java Processing Worker consuming `asset.uploaded.v1`, safely processing a synthetic PDF, and emitting an outcome with bounded retries and deduplication. Avoid unbounded parsing/execution.
5. Implement Workspace API as a BFF using versioned internal API, validated trusted demo identity and tenant-specific authorization.
6. Implement React upload/status UI with typed client interfaces, loading/failure states, bounded status polling and appropriate accessibility.
7. Add provider/consumer contract tests, cross-tenant negative tests, Kafka duplicate/out-of-order tests, and full upload-to-completed E2E using synthetic documents.
8. Add measured source coverage gates (>=75%), dependency locks, CI test segregation, and independent artifact/build checks.
9. Open a Draft PR with issue/OpenSpec links, change scope, test evidence and rollback notes. Do NOT merge.

### Mandatory invariants
- Asset Service owns authoritative status and asset metadata; no cross-service table access.
- Only synthetic documents and synthetic identities; no proprietary names, documents, URLs or secrets.
- All HTTP endpoints and Kafka event payloads must match the checked-in contracts.
- User-controllable headers never confer tenant or service identity.
- Duplicate/out-of-order events must not cause duplicate side effects or invalid transitions.
- Handle permanent failures deterministically; document retry and reconciliation strategy.
- All runtime/container dependencies must have justified operational purpose.

## Suggested kickoff (in local Codex CLI)
```text
Read AGENTS.md and docs/architecture/principles.md, then inspect the approved
LAB-101 OpenSpec change and all contracts. Implement LAB-101 on this branch,
following the handoff plan in docs/implementation/LAB-101-CODEX-HANDOFF.md.
First summarize architectural decisions and identify any contract conflict.
Do not change approved contracts without review. Make small commits with
tests and prepare a Draft PR. Never merge automatically.
```

## Evidence requirements before review
- Contract validators green
- Java build + unit/integration tests green
- Frontend typecheck/build/Vitest green
- E2E success + rejection + tenant isolation scenarios green
- Coverage reports showing >=75% source code coverage
- Verified affected-only Nx/Gradle behavior, with timing data
- Security and secret scanning results
