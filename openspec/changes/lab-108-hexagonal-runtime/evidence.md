# LAB-108 implementation and local validation — 2026-10-31

Revision 1 at `6bcb255` was approved by the repository owner (“одобрявам”);
see approval.md. Implementation is ready for human review, not a merge approval,
completed dev integration, production cutover or production-readiness claim.

## Isolation and delivery

- Dedicated worktree `atlas-workspace-lab-108`, branch
  `refactor/lab-108-hexagonal-runtime`; original worktree edits/HEAD and running
  user environments preserved. All real development validation used dev mode.
- `dev` was absent and was created at reviewed main `9e028c7`. The task/spec
  worktree predates ADR-0003 and is stacked on LAB-107 `4e6a477`. Governance and
  runtime integration are presented together in PR #11 for review; the required
  reviewed dev integration has not already happened. No merge/archive/protection
  bypass or hosted promotion run was performed.
- Real dependencies use distinct Compose projects (`atlas-lab-108`, then
  `atlas-ci-<candidate>`), loopback ports 15432/19000/19092 and separate kind
  clusters/runtime directories. Existing user data was never a test database.
- Node v24.22.1 is selected through PATH because system Node cannot load ICU;
  no system repair was made. Private keys, fixture tokens, documents, snapshots,
  kubeconfigs and raw logs remain under ignored local paths and are not published.

## Exact checks and corrections

[local-validation.json](local-validation.json) preserves commit IDs, aggregate
check results and affected reruns. **No single final all-green `make ci` execution
is claimed.** Aggregate candidate `0659f50` passed all checks through native
Kubernetes/security and the 11 standard Helm scenarios, then exposed two E2E
lifecycle/operational defects. The original failed result is retained.

- Stop/up closes the shared UI forward. `30e165a` gives each new conformance test
  its own temporary API forward and refreshes fixture identity after maintenance.
- Repeated Helm history made an unscoped `get secrets` exceed the process capture
  bound. `1dd4ab8` fetches only the exact owned Secret names in setup/verification;
  no buffer increase, credential reset or protection bypass was used. Native/Helm
  regression tests reject unscoped reads, and actual repeated setup succeeded in
  the retained namespace with its existing history.
- Final semantic review found request-time provider construction in the parser
  handler. `0623970` binds the converter/application once during server startup;
  the handler invokes the selected capability. An actual HTTP test selects an
  alternate converter without changing the handler, and invalid bindings fail
  startup. Wire contracts and security boundaries are unchanged.

Unchanged Java/frontend/contracts/native-runtime evidence is retained at its
recorded candidate. Affected tooling, conformance, parser and deployment checks
were rerun after their respective changes; the exact scopes/results are in the
machine-readable record. Final `make check` and refreshed `make helm-security-dev ENV=dev` passed
with the evidence-only documentation update; results are also recorded in PR #11.
Hosted checks deliberately do not run on this dev PR.

## Implemented behavior and measured evidence

- All OpenAPI versions and both AsyncAPI versions passed authoritative validation,
  with negative compatibility/architecture/promotion-source tests. V1 shapes remain;
  staging and neutral parser/read/processed v2 are additive. Consumer-first rollout
  remains mandatory for existing data; there is no dual publication.
- Strict source audit: zero findings with an empty baseline. The historical 148
  findings remain in debt-review.md, not accepted as waivers. Seven guardrail tests
  passed (98.55% lines / 97.24% branches). Independent semantic review is required.
- Full Java build/integration checks passed against isolated real PostgreSQL and
  RustFS: upload intents/idempotency/compensation, hidden staged writes, lost stage
  acknowledgement, conditional immutable puts, corruption/scope refusal, fenced
  finalization/stable outcomes, owner migration and new-write legacy restoration.
  Measured integration checkpoint source line coverage: shared 94.64%, asset 93.14%,
  worker 86.75%, BFF 88.06%; all configured >=75% source gates passed. No blanket
  >=75% branch coverage claim is made.
- Final offline parser tests: 21 passed, 92.45% coverage. Core accepts a structural
  alternate converter; provider pins/native checks stay in the Docling adapter.
  Input/output/page/OCR/deadline bounds remain. No runtime model downloads added.
- Frontend build/typecheck and tests passed (100% lines / 95.4% branches). Nx build
  boundary checks passed. Independent asset and BFF builds were also exercised.
- Compose E2E: 7 passed. Native Kubernetes E2E: 7 passed, including identity/tenant
  denial, duplicate/restart recovery, default-deny, stateful recreation, retained
  PVC stop/up and scoped credentials. Probe coverage checks passed.
- Dev Helm runtime: 11 standard scenarios passed twice; the cross-profile case is
  deliberately skipped in dev-only execution. This includes API/Make parsed reads,
  independent release upgrade/rollback and retained data recovery. Prod-demo runtime
  validation belongs to later hosted promotion, not local development.
- Real parser substitution/maintenance conformance passed after the fixes (6.2m):
  unchanged worker/asset/BFF templates, alternate neutral HTTP provider with no
  native JSON, no new document bodies in worker storage, authorized reads and tenant
  refusal. Final worker black-box conformance passed against the final parser image.
  Its ledger is explicitly volatile; normal worker SQL durability has separate
  restart/fencing tests, and no replacement production engine is claimed.
- Maintenance commands exercised real pause/drain, snapshots, restore into separate
  randomly named Compose projects, checksum comparison, nonempty repeated owner
  migration, compatibility restoration of new portable writes and dry-run-only
  reconciliation. Native-less output refuses old-reader rollback before writes;
  no native document is fabricated or discarded. Restored containers are stopped
  with volumes retained; snapshots and proof markers remain private.
- Final parser build/deploy changed only its image inventory entry. Three replicas
  became ready; real original-worker upload, v1/v2 API/Make reads, tenant denial and
  independent parser redeploy passed (3 smoke tests). Worker conformance passed
  again (1 test) against that final parser image.
- Native tooling: 3 tests, 96.86% lines / 94.23% branches; Helm tooling: 2 tests,
  95.34% / 90.63%. Restore helper: 100% lines/branches; independent build helper:
  100% / 91.67%; credential helper: 100% / 95.45%. Maintenance helper: 85.21% / 83.70%.

## Security, limitations and remaining review

Real storage tests deny derived deletion/listing/source writes and deny derived
reads by source identities. Workload/tenant/binding, malformed/oversized data and
unavailable/corrupt content cases fail closed. Dev image, rendered-manifest and
repository scans passed after the minimal follow-redirects 1.16.1 -> 1.16.2 fix for
[GHSA-mrwp-f3q8-3g9p](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-mrwp-f3q8-3g9p).
No ignore/severity rule was weakened; the final refreshed scan passed and is
reported in PR #11.

An unhandled Kafka consumer/database/content-verification failure retains the
existing fail-closed listener stop. Repair and explicit service restart are needed
for redelivery; automatic consumer recovery is not implemented. Worker ledger
processing/publication retries are separately bounded. Reconciliation never deletes.
Native-less results support neutral v2 but not provider-native v1 compatibility.

See architecture-review.md, the compliance matrix and LAB-108 runbook. Human
architecture/code review and integration into dev remain outstanding. A later
same-repository dev-to-main PR must run required hosted checks before human merge.
Do not merge, archive, delete legacy data or relax protections on this evidence.
