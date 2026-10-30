# Kubernetes runtime — revision 1

1. On a supported host, make k8s-setup creates only the dedicated local cluster
   and isolated synthetic credentials. Repetition preserves complete state;
   partial/mismatched credentials or an unexpected context fail without writes.
2. make k8s-dev builds/loads immutable images and starts the UI, API, asset service,
   worker, PostgreSQL, Kafka and RustFS inside Kubernetes. Browser access is only
   through loopback forwarding. Uploading a synthetic PDF reaches COMPLETED.
3. Failed initialization or readiness stops dependent rollout with bounded waits,
   a failing exit code and sanitized diagnostics. Repeated up is recoverable and
   preserves topic/bucket/database ownership, identities and data.
4. Each workload receives only its required credentials/keys and no Kubernetes API
   permissions. Unauthenticated and cross-tenant requests fail; worker database
   and object privileges remain scoped. Disallowed pod traffic is proven blocked,
   including an unrelated test pod attempting database/broker/object access.
5. Worker restart and stateful pod recreation retain durable checkpoints, accepted
   uploads and object data; duplicate events do not duplicate terminal effects.
6. Ctrl+C stops owned forwarding. k8s-stop preserves persistent state; k8s-up restores
   operation. No default workflow deletes volumes, clusters or credentials.
7. CI renders/validates manifests, runs actual Kubernetes browser E2E, failure/security
   checks and scans; new helper source meets ≥75% measured coverage. Existing
   application/contract/Compose checks continue passing.
8. README/runbook document prerequisites, measured resource needs, every Make target,
   startup/stop/recovery, trust boundaries and local-only durability limitations.
   No production-readiness, HA, encrypted-Secret or DR claim without evidence.
