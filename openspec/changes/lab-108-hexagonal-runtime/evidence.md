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
  upstream to main. No remote dev branch existed when inspected. No integration,
  merge, archive, protection bypass or hosted run performed.
- The spec/governance branch predates ADR-0003 and is stacked on LAB-107 at
  `4e6a477`. Governance integration into reviewed dev is still outstanding;
  do not claim the required dev integration sequence has completed.
- Real integration dependencies use a distinct Compose project `atlas-lab-108`,
  PostgreSQL loopback 15432 and RustFS 19000. Existing user ports/data untouched.
- Real Helm validation uses distinct kind cluster `atlas-lab-108`, namespace
  `atlas-dev`. Local prod-demo deployment is not part of this validation.
- System Node cannot load ICU; checks use installed Node v24.22.1 via PATH.
  No system environment repair or dependency-version change was made.

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
- Java source line coverage at the measured checkpoint: shared 95.09%, asset-service
  93.00%, worker 86.75%, BFF 88.06%. All configured >=75% source gates passed.
  Branch coverage is a separate metric; no blanket >=75% branch claim is made.
- HTTP tests enforce workload audience/subject, verified tenant mapping, bounded
  payloads, strict neutral versions and unavailable-content failure behavior.
- Parser offline container tests: 20 passed; total measured Python coverage 92.25%.
  Pure application accepts a structural alternate converter; provider checks remain
  in the Docling adapter. No runtime model downloads or OCR were introduced.
- Maintenance helper coverage: 87.12% lines / 84.15% branches. Owner processes receive
  only required owner credentials; tests cover private snapshots, repeated migration,
  checksum verification, conservative reconciliation and restored replica counts.
- Native Kubernetes tooling tests: three cases, 98.37% lines / 94.17% branches.
  Helm helper tests passed before the latest configuration overrides; rerun required.
- Frontend build/typecheck and tests passed; 100% lines / 95.4% branches.

## Validation still required

- Rerun affected checks after final edits and bind final evidence to a clean commit.
- Complete dev Helm/native Kubernetes E2E and real staging identity/security checks;
  prove alternate parser through the running worker with unchanged component images.
- Exercise maintenance commands against the real cluster, restore backups into a
  disposable environment and verify rollback after new writes, including refusal
  for results without native JSON. Unit/integration tests alone do not prove backups.
- Complete repository/image/manifest security scans and document actual findings.
- Semantic architecture review, compliance matrix/runbook final review and PR to dev.
- Required hosted promotion checks run only on reviewed dev-to-main promotion, then
  human merge review. These are future release steps, never silently bypassed.

Private logs/reports remain under ignored `.local` and Gradle coverage directories;
no credentials, document contents, kubeconfig or snapshots are committed.
