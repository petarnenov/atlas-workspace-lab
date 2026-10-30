# LAB-103 verification — 2026-10-30

Approval: revision 1 approved in the task conversation; see approval.md.
Runtime: dedicated kind v0.33.0, Kubernetes v1.35.8, digest-pinned node and
kindnet image; scoped kubeconfig and namespace. Tool checksums and image digests
are recorded in infra/k8s/versions.json. No application contracts changed.

## Verified locally

- All seven runtime components reached Ready; Kafka and storage bootstrap Jobs completed.
- Real static-UI PDF upload reached COMPLETED through Kubernetes API/Kafka/worker/S3.
- Identity denial, tenant denial, idempotent retry and malformed PDF failure passed.
- Worker restart plus duplicate Kafka delivery retained one terminal checkpoint/version.
- Authorized dependency connections succeeded; an unrelated pod was denied access
  to PostgreSQL, Kafka and S3. Startup now also executes positive/negative proof Jobs.
- Java probes: 3 unit tests; JaCoCo 25/27 source lines (92.59%) and 14/18 branches
  (77.78%); 75% line/branch gates enforced by k8sProbeCheck.
- Existing Java unit, frontend (21 tests), scaffold, architecture and contract
  invariant checks passed. Frontend retains 100% lines / 95.4% branches.
- Workload image scans: all eight images report zero HIGH/CRITICAL findings.
  Repository secret/vulnerability scan passed. Kubernetes scanner verifies it
  actually recognized manifest files; empty/unsupported scan output fails.
- One observed node-container sample after deployment: 1.448 GiB memory usage.
  Doctor conservatively requires 4 CPUs/6 GiB Docker RAM; this sample is not a
  capacity, availability, backup or production-readiness claim.

## Recovery and corrections verified during implementation

The owner manually deleted the initial cluster. Setup recreated only the named
local cluster with retained local synthetic credentials. Dedicated kubeconfig
comparison canonicalizes equivalent config formatting and checks cluster identity.
Worker uses Recreate because a single Kafka partition can leave a rolling-update
replacement without an assignment while the old pod remains ready. No schema,
security principal or HTTP/event boundary changed. UI/scripts have explicit image
ownership/permissions so a restrictive host umask cannot break non-root execution.

## Final local verification

- make k8s-test passed: Java probe coverage gates, three Node helper suites with
  measured ≥75% lines/branches/functions gates, and all seven real Kubernetes
  E2E scenarios (4.1 minutes).
- Stateful pod recreation retained accepted receipts, outbox payloads and objects;
  a new upload completed after dependency recreation.
- Stop/up retained PVC UIDs and restored all workloads; prior receipt stayed COMPLETED.
- Database-role cross-access was denied, and the read-only object identity could
  stat the original retained object but could not write a new object.
- Startup positive/negative connectivity proof Jobs passed before app deployment.
- CI and human code review remain required before merge. No merge or archive
  is authorized by spec approval alone.
