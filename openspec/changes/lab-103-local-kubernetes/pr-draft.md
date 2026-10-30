# LAB-103: run the complete synthetic demo in local Kubernetes

`make k8s-dev` builds and starts the static UI, API, asset service, worker,
PostgreSQL, Kafka and RustFS in a dedicated local kind cluster, with loopback UI
forwarding. Scoped immutable Secrets and PVCs preserve identities and data across
reconciliation and stop/up. Existing Compose commands remain available.

- Tracking: synthetic story LAB-103, OpenSpec change `lab-103-local-kubernetes`.
- Exact specification approval: approval.md; proposal/design/spec/tasks revision 1.
- Components: Make targets, Node infrastructure helpers, exec probes and measured
  tests, native manifests/images, Kubernetes E2E/CI, operations documentation.
- Contracts: existing versioned OpenAPI/AsyncAPI remain unchanged. Database/object
  ownership and synthetic-only tenancy remain enforced.
- Principles: P02/P03/P05–P10/P12/P15–P20; no principle exception, cloud deployment,
  public ingress, AI infrastructure or production-readiness claim.

Validation and current CI status are tracked in evidence.md. Java probes enforce
75% line/branch coverage; Node helpers enforce 75% lines/branches/functions.
Real-cluster tests cover upload, denial, idempotency, restart, network policy and
persistent recovery. All workload images and manifests are scanned. The startup
path fails before dependent app deployment if initialization or network proof fails.

Rollback: return to prior reviewed compatible manifests/images with matching local
credentials and retain PVCs. Cluster deletion destroys local data and is never a
default Make operation. Human review and green CI are required before merge.
