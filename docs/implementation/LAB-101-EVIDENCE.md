# LAB-101 delivery evidence — 2026-10-30

Issue: https://github.com/petarnenov/atlas-workspace-lab/issues/2
Branch: `feat/lab-101-implementation`. Local implementation verified; GitHub CI
and human PR review are separate gates. No merge, archive or production claim.

## Approved scope

Original HTTP/event contracts and implementation decisions are approved as
recorded in [approval evidence](LAB-101-APPROVAL.md). Additional checkpoint
ownership and S3-compatible replacement are recorded in the corresponding
OpenSpec changes. Original contract files remain byte-for-byte unchanged.
RustFS replaces MinIO; the archived MinIO exception was never exercised.

Acceptance criteria from issue #2 (verbatim):

1. Portal UI uploads a synthetic demo document.
2. Asset service validates input and stores file/metadata.
3. Processing worker consumes an async event and produces a result.
4. Workspace API exposes processing status.
5. UI shows progress and final status.
6. Include OpenAPI/AsyncAPI contracts, independent tests, failure scenarios, and E2E happy path.

All six criteria are exercised by implemented code and local checks below.
See [operations and rollback](LAB-101-RUNBOOK.md) for component ownership,
identity boundaries, recovery, retention and operational limitations.

## Local checks

| Check | Result |
| --- | --- |
| Gradle build with `-Pintegration`, independent runnable JARs | PASS; 28 Java tests, zero skipped/failures |
| Java unit tests without Docker-dependent integration tags | PASS; separate CI job |
| React TypeScript/Vite build | PASS |
| Vitest frontend | PASS; 21 tests in four files |
| Playwright with real PostgreSQL/Kafka/RustFS/JVM services | PASS; seven tests |
| OpenAPI 3.1, Redocly CLI 2.72.1 | PASS; both contracts |
| AsyncAPI 3, CLI 6.2.2 | PASS; zero errors/warnings; informational newer-spec suggestion only |
| Scaffold, architecture/private imports, contract invariants | PASS |
| Trivy 0.76.1 repository including development dependencies | PASS; zero HIGH/CRITICAL vulnerabilities and zero secret findings |
| Trivy derived PostgreSQL, derived Kafka, RustFS, native bootstrap image | PASS; zero HIGH/CRITICAL discoverable package findings |
| Git contract diff and whitespace check | PASS |

The security scan does not suppress any HIGH/CRITICAL advisories. Vulnerable
base-image/development dependencies were patched or replaced, including the
PostgreSQL privilege helper and Kafka compression JARs. Rust binary internals
are not exhaustively covered by the image package scanner. No claim of zero
possible vulnerabilities is made.

Measured source coverage after Java formatting (JaCoCo 0.8.14 LINE):

| Module | Covered / total lines | Coverage |
| --- | --- | --- |
| demo-support | 163 / 172 | 94.77% |
| asset-service | 189 / 198 | 95.45% |
| workspace-api | 37 / 41 | 90.24% |
| processing-worker | 119 / 129 | 92.25% |
| portal-ui (V8) | 91 / 91 | 100% lines; 95.40% branches |

Every Java module enforces at least 75% source line coverage. Frontend enforces
75% lines, statements, branches and functions. UI's DOM bootstrap `main.tsx` is
the only source excluded from V8 instrumentation and runs in the browser E2E.
Java main/application wiring is included. Reports are generated under each
component's ignored build/coverage directory; CI uploads Java coverage XML only.

## Reliability and security scenarios

Java unit/integration tests exercise signed identity wrong signer, audience,
issuer, lifetime, missing claims and unknown tenant; unsafe/over-limit uploads;
concurrent idempotency; interrupted object writes and compensation; expired
keys; cross-tenant reads; both database credential boundaries; worker read-only
S3 permissions, no bucket listing/other-bucket access and anonymous denial;
broker retry exhaustion; asset reconciliation; invalid/unknown/scope-mismatched
and conflicting events; fenced leases; immutable outcome republication; safe
PDF rejection and hard parser deadline.

Seven real-service E2E scenarios:

1. Browser upload → BFF → Asset Service → S3/outbox → Kafka → worker → outcome
   → terminal UI. Actual provider/consumer receipts and events validate against
   the approved OpenAPI/AsyncAPI schemas.
2. Tenant denial, ignored spoofed tenant header, missing identity, idempotent
   receipt replay and malformed PDF terminal failure.
3. Wrong media/extension, magic, empty and oversized input create no metadata.
4. Actual Kafka duplicate inputs/outcomes and conflicting terminal event leave
   one checkpoint and immutable terminal version 2.
5. SIGKILL/restart worker, replay input, verify original outcome and attempt count,
   then process a new upload through the replacement process.
6. Stop storage, verify sanitized 503 and no metadata/outbox, restore storage and
   successfully retry the same key.
7. Force-recreate Kafka/RustFS containers, compare original Kafka offsets and
   exact stored PDF bytes, replay original receipt and process a fresh upload.

These prove the listed local failure paths, not production SLOs, isolation
against a compromised host, unlimited concurrency, or multi-region recovery.

## Affected builds and measured timing

`node scripts/local/measure-builds.mjs` asserts exact affected project sets:
UI source → only portal; asset source → only asset-service; public Wire helper
→ all four Java modules and no UI. An asset build compiles its shared library
through Gradle project dependencies without building other deployables.

Single local sample, JDK 21 / Node 24, existing Gradle/pnpm downloads and Gradle
outputs warm. “Uncached” below means Nx task cache disabled, not a clean-machine
or cold dependency download benchmark. All five build targets ran successfully.

| Invocation | Wall time |
| --- | --- |
| All builds, Nx cache disabled | 31.68 s |
| All builds, populate Nx cache | 32.72 s |
| All builds, warm Nx cache | 1.29 s |
| UI-only affected build, Nx cache disabled | 3.44 s |
| Asset-only affected build, Nx cache disabled | 8.00 s |

No statistical performance claim is made from one sample. Reproduce locally;
raw logs and machine-local metadata remain ignored in `.local/`.

## Pending review gates

[Draft PR #4](https://github.com/petarnenov/atlas-workspace-lab/pull/4) contains
approval links, scope, verification and rollback. Current GitHub Actions results
are visible on its Checks tab. Owner review remains required. OpenSpec changes stay unarchived and the branch stays unmerged.
