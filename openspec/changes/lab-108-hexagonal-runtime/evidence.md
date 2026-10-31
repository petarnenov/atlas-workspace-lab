# LAB-108 implementation evidence — in progress, 2026-10-31

Approval: revision 1 at `6bcb255`, repository owner “одобрявам”; recorded in
approval.md. `bbf737b` records approval, additive neutral contracts and promotion
entry gates. Runtime validation below follows that approval. This is not a
completion, merge approval, migration cutover or production-readiness claim.

## Isolation and delivery

- Task worktree: `atlas-workspace-lab-108`, branch
  `refactor/lab-108-hexagonal-runtime`. Original worktree edits and running user
  environments preserved.
- Local `dev` bootstrapped from `origin/main` (`9e028c7`), with no misleading
  upstream to main. No remote dev branch existed initially; `dev` was subsequently created at the
  same reviewed `main` commit. No integration, merge, archive, protection bypass
  or hosted run performed.
- The spec/governance branch predates ADR-0003 and is stacked on LAB-107 at
  `4e6a477`. Governance integration into reviewed dev is still outstanding;
  do not claim the required dev integration sequence has completed.
- Real integration dependencies use a distinct Compose project `atlas-lab-108`,
  PostgreSQL loopback 15432 and RustFS 19000. Existing user ports/data untouched.
- Real Helm validation uses distinct kind cluster `atlas-lab-108`, namespace
  `atlas-dev`. Local prod-demo deployment is not part of this validation.
- System Node cannot load ICU; checks use installed Node v24.22.1 via PATH.
  No system environment repair was made. A dependency security fix is recorded below.

## Completed local checks

- Authoritative `make contracts-validate`: both AsyncAPI versions and all OpenAPI
  versions passed. Existing v1 shapes remain; parser/public read v2 and artifact
  staging/processed v2 are additive. Consumer/publisher boundary tests accompany
  strict runtime decoding.
- `make check architecture-test ci-policy-test test-tools build-ui test-frontend`:
  passed. Strict static audit: zero findings and empty baseline, not debt waivers.
- Architecture guardrail tests: seven cases, 98.55% lines / 97.24% branches.
  Python imports/class references are distinguished from generic converter-port
  method calls; negative fixtures prevent an adapter-import escape.
- Full Java `build -Pintegration`: passed against isolated real PostgreSQL/RustFS,
  including upload intent/idempotency/compensation, fenced outcomes, hidden staging,
  lost stage acknowledgement, real conditional object put, tenant/source binding,
  migration repeatability and compatibility restoration of new v2 copies.
- Java source line coverage at the measured checkpoint: shared 94.64%, asset-service
  93.14%, worker 86.75%, BFF 88.06%. All configured >=75% source gates passed.
  Branch coverage is a separate metric; no blanket >=75% branch claim is made.
- HTTP tests enforce workload audience/subject, verified tenant mapping, bounded
  payloads, strict neutral versions and unavailable-content failure behavior.
- Parser offline container tests: 20 passed; total measured Python coverage 92.25%.
  Pure application accepts a structural alternate converter; provider checks remain
  in the Docling adapter. No runtime model downloads or OCR were introduced.
- Maintenance helper coverage: 85.21% lines / 83.70% branches. Owner processes receive
  only required owner credentials; tests cover private snapshots, repeated migration,
  checksum verification, conservative reconciliation and restored replica counts.
- Native Kubernetes tooling tests: three cases, 96.86% lines / 94.17% branches.
  Helm helper tests: two cases, 95.34% lines / 90.58% branches.
  Fake-cluster helper tests explicitly clear real runtime overrides.
- Frontend build/typecheck and tests passed; 100% lines / 95.4% branches.

## Additional runtime and security evidence

- Real dev Helm runtime suite: 11 passed, one cross-profile case intentionally
  skipped in dev-only mode. It covers upload/read/tenant denial, duplicate outcomes,
  worker restart, network denial, pod recreation, retained PVC stop/up, independent
  Helm release upgrade/rollback and scoped source credentials.
- Separate parser-substitution test exercises a neutral HTTP provider with no
  Docling import or native JSON through unchanged worker, asset and BFF templates.
  It also runs pause/drain, snapshots, restore-check, repeated migration,
  checksum verification, rollback-copy and conservative reconciliation.
  The isolated full scenario passed in nine minutes; the final clean candidate
  repeats it in aggregate CI.
- Replacement worker black-box harness passed in 1.6 minutes against original
  asset-service/BFF/parser images and unchanged templates. It consumes real uploaded
  v1 in an independent Kafka group, calls the original parser, stages with the worker
  identity, retries a lost acknowledgement byte-identically, rejects conflicting
  stage bytes and stale completion, publishes the same processed v2 twice and
  verifies one terminal asset version plus tenant-safe neutral reads. Its ledger
  is deliberately volatile; normal worker SQL durability has separate restart tests.
- Compose E2E: all seven passed on clean candidate `9d425c8`, including UI completion,
  tenant/idempotency/refusal, duplicate/conflicting outcomes, worker restart,
  storage outage and retained container recreation. Aggregate checks were stopped
  during native image loading to include the additional worker harness in the
  final candidate; this partial run is not reported as complete CI.
- Real backup restore-check restored both owner databases and the RustFS volume
  into a separate randomly named Compose project, verified asset exports and
  stopped the disposable containers. Private restore markers were produced.
- New portable writes were restored byte-for-byte into the worker legacy reader
  by the real rollback-copy command. Native-less rollback refusal is an explicit
  negative scenario; no documents are fabricated or deleted.
- Real storage tests verify that the derived identity cannot delete/list or write
  source objects, and source identities cannot read derived content.
- Independent `asset-service` image build/load/deploy and BFF component build passed.
  Other service templates stay unchanged when only the selected parser changes.
- Restore helper coverage: 100% lines/branches; independent build helper coverage:
  100% lines / 91.67% branches; staging credential helper: 100% / 95.45%.
- Dev Helm image/rendered-manifest/repository scans passed after fixing the HIGH
  follow-redirects advisory GHSA-mrwp-f3q8-3g9p with the minimal lockfile/override
  update from 1.16.1 to 1.16.2. No ignore rule or severity gate was weakened.
  Primary advisory: https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-mrwp-f3q8-3g9p
- Implementation self-review is recorded in architecture-review.md, including
  manual Kafka consumer recovery and native-less compatibility limitations.
  Independent human architecture/merge review remains required.

## Validation still required

- Rerun affected checks after final edits and bind final evidence to a clean commit.
- Complete the unified clean-candidate `make ci ENV=dev` run, including refreshed
  Compose/native Kubernetes/dev Helm E2E and scans. Its exact revision and full
  pass/fail outcome belong in the PR; individual earlier checks do not substitute
  for a successful aggregate run. An earlier Compose run exposed stale v1 event
  expectations and a too-short restart/UI wait; tests now use v2 and account for
  Kafka rebalance plus bounded conversion without changing runtime deadlines.
- PR to dev and independent human review. Architecture self-review is not approval.
- Required hosted promotion checks run only on reviewed dev-to-main promotion, then
  human merge review. These are future release steps, never silently bypassed.

Private logs/reports remain under ignored `.local` and Gradle coverage directories;
no credentials, document contents, kubeconfig or snapshots are committed.
