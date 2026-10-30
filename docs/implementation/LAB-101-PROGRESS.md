# LAB-101 execution progress — 2026-10-30

Branch: feat/lab-101-implementation. Work in progress; no merge/archive.

## Approval

See LAB-101-APPROVAL.md: owner approved exact revision 11f8f6a in this
conversation. Original wire contracts remain unchanged.

## Written, not yet accepted as complete

- Gradle wrapper 9.2.1, Java 21 toolchains, initial dependency locks and JaCoCo
  75% LINE gate configuration. Coverage has NOT yet been measured.
- Public demo-support library for wire DTOs, Nimbus signed synthetic identities,
  HTTP failures, bounded object calls and PDF upload validation. This library
  holds no domain state and imports no private service source.
- Disposable Compose PostgreSQL, Kafka and MinIO wiring; independent databases,
  scoped object-store policies and ignored ephemeral credential/key generation.
- Asset-service upload intents, metadata/outbox transaction, tenant reads,
  idempotency replay, outcome deduplication, dispatch and reconciliation.
- Worker input/outcome checkpoint, fencing, retry/publish scanners and bounded
  PDF parser subprocess; separate worker-owned database.
- BFF signed service identity forwarding, bounded HTTP calls and React upload/
  status form with failure messages, accessibility and bounded polling.

## Evidence actually obtained

- `./gradlew compileJava --no-daemon --write-locks`: PASS for all JVM modules.
- `pnpm --filter @atlas/portal-ui build`: PASS (TypeScript and Vite).
- Gradle wrapper generated successfully.
- PostgreSQL and Kafka image pulls started successfully; MinIO pulls fail.
- Existing OpenAPI/AsyncAPI validators were green before feature changes; the
  checked-in contracts have not been edited.

## Discovered blocker and required decision

Official MinIO community software is archived/unmaintained; registry pulls and
binary downloads fail. Feature work stopped on confirming this P20 conflict.
Review `docs/architecture/exceptions/lab-101-minio-lifecycle.md`. No unsupported
source build or storage substitution has been performed.

## Remaining before claiming delivery

- Approve/resolve MinIO lifecycle, then run Compose and verify real dependencies.
- Add meaningful unit/integration/provider/consumer/security tests. Original
  scaffold tests require adaptation to the new applications; no claim they pass.
- Verify upload intent concurrency/recovery, dispatcher recovery, event-ordering
  and worker fencing/retention/publication using failure injection and restart.
- Resolve Vitest coverage package peer mismatch (3.2.4 vs installed 3.2.7) before
  running the measured frontend coverage gate.
- Frontend tests, real synthetic upload/status/cross-tenant E2E, measured >=75%
  source coverage, dependency/security/secret scans, CI segregation and affected
  Nx/Gradle measurements remain outstanding.
- Review implementation and fix findings; prepare Draft PR with full evidence
  and rollback instructions. No CI completion/reviewer approval is claimed.

This progress record describes unfinished local code, not a production-ready
system or a completed LAB-101 implementation.
