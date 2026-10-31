# Tasks — revision 1

- [x] Link synthetic LAB-108; inspect accepted ADRs and full debt inventory.
- [x] Prepare full scope, neutral contracts, asset ownership, migration and failure design.
- [x] Record requested worktree/dev/promotion-only CI policy in proposed ADR-0003.
- [ ] Obtain exact revision 1 approval, record commit/owner/date and ADR status.
- [ ] Review/integrate LAB-107 governance into dev; preserve pending debt visibility.
- [ ] Encode and validate reviewed OpenAPI/AsyncAPI shapes before runtime changes.
- [ ] Add source/trigger tests and local Make CI-equivalent entrypoint; update all
      five workflows for promotion-only policy, preserving required gate semantics.
- [ ] Extract shared identity/upload/event values from transport/crypto/JSON code.
- [ ] Extract asset upload/query/outcome applications and persistence/source ports;
      prove original idempotency, intent, compensation and dedup failure behavior.
- [ ] Extract worker application/kernel and execution/publication/sandbox/source ports;
      preserve lease/fence/retries/cancellation and stable durable outcomes.
- [ ] Isolate Docling conversion adapter; add neutral parser v2 and substitution tests.
- [ ] Implement asset-owned ArtifactStore/manifests/staging and scoped identities;
      test real RustFS, corruption, cross-tenant denial and lost acknowledgements.
- [ ] Add processed v2 consumer first, then worker publisher; prove crash recovery.
- [ ] Add v2 reads, v1 compatibility, BFF routing and Make inspection commands.
- [ ] Implement dev-only migration, snapshots/export/import verification and bounded
      dry-run reconciliation; prove repeatability and rollback including new writes.
- [ ] Remove obsolete concrete code; update exact file roles, empty debt baseline
      only after all findings are gone; run strict full audit and semantic review.
- [ ] Run meaningful happy/failure unit, integration, adapter/consumer contracts,
      >=75% measured source coverage, dev Kubernetes E2E and security checks locally.
- [ ] Verify independent build/deploy, parser three replicas, config-only substitution
      and original component images in worker black-box conformance tests.
- [ ] Record actual evidence/runbook/compliance matrix and human review; integrate
      to dev, then run mandatory hosted promotion checks on dev-to-main PR.
- [ ] Obtain human merge review. Do not auto-merge, archive or delete legacy data.
