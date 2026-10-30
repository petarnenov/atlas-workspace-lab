# LAB-103 — Local Kubernetes operations

This deployment is a disposable, single-node kind learning environment. All
application and dependency processes run in Kubernetes. Runtime ownership,
HTTP/event contracts, synthetic identities and tenant enforcement are unchanged.
Compose remains independent; its volumes and credentials are never migrated.

## Lifecycle

Run `make k8s-tools` to explicitly install checksum-verified kind locally, then
`make k8s-doctor`, `make k8s-setup`, `make k8s-build`, `make k8s-up` and
`make k8s-forward`, or combine setup/build/up/forward using `make k8s-dev`.
Host tool installation requires the operator; setup never installs host tools.
The dedicated kubeconfig is `.local/k8s/kubeconfig`, context `kind-atlas-lab`,
namespace `atlas-lab`. Commands compare it against the dedicated kind cluster
before mutation; do not replace it with a shared/production kubeconfig.

Initialization waits for persistent dependencies, runs bounded Kafka/storage
bootstrap Jobs, then deploys apps. Failed init prevents dependent app rollout;
fix the cause and rerun up. Repeated setup/up reuse matching immutable Secrets.
Partial local credentials or cluster mismatches require restoring the matching
local credential files, not rotation or automatic regeneration.

`make k8s-status` shows workloads, PVCs and Jobs. `make k8s-logs` shows recent
pod logs; inspect them locally and redact before sharing. Diagnostic output must
never include Secret objects, key material or uploaded contents. Resource and
readiness failures return nonzero; do not increase deadlines to hide failures.

Ctrl+C stops the owned forwarding process. `make k8s-stop` scales apps and stateful
services to zero; PVCs, Secrets and cluster remain. `make k8s-up` restores replicas.
One cluster can require several GiB of downloaded images and disk; doctor requires
4 CPUs/6 GiB Docker RAM. Measured results belong in LAB-103 evidence, not HA claims.

## Security and persistence

All services are ClusterIP; only UI port-forward binds host loopback. No ingress,
NodePort, LoadBalancer or database/broker/S3 host ports are created. Default-deny
policies allow only dependency paths and DNS. Tests verify positive authorized
connectivity and negative unrelated-pod connectivity. A manifest alone does not
prove enforcement. kind's pinned embedded CNI supplies network policy handling.

Workloads run non-root with capability drops, no privilege escalation, seccomp,
resource limits, no Kubernetes service-account token and read-only root filesystems.
Explicit writable tmp/config/log/socket/data volumes accommodate upstream images.
Local Kafka and object traffic are plaintext. Cluster administrators and the local
Docker host remain trusted; Secrets are not encrypted-at-rest proof. No cloud
identity, mTLS, managed secret store or multi-node availability is claimed.

PostgreSQL PVC retains two databases with separate asset/worker ownership. Kafka
PVC retains logs/topics. RustFS PVC retains objects and IAM. API receives only
fixture verification and service signing keys; asset/worker have no admin secrets.
The worker keeps its read-only object identity and private checkpoint database.
The parser remains a bounded separate JVM; containerization is not a complete
sandbox against hostile documents. Use only synthetic PDFs and tokens.

## Validation, rollback and destructive teardown

`make k8s-test` runs helper coverage gates plus browser/security/restart/persistence
checks against this disposable environment, without a host Java harness or Vite.
Run existing `make check` and Compose suites separately. `make k8s-security` scans
manifests, all workload images and repository; reports are ignored local artifacts.
Do not publish Secret data in CI artifacts. Image inventory records content IDs.

Rollback deploys the previous reviewed manifests/images only with compatible
schema and matching credentials. Stop and inspect before crossing incompatible
schema versions. Never remove PVCs or credentials as automatic rollback.

Deleting the kind cluster destroys local PVC data. If the operator explicitly
chooses a full disposable teardown, `kind delete cluster --name atlas-lab` using
the verified local binary removes that cluster; credential deletion is a separate
explicit choice. Default Make commands never delete clusters, namespaces or PVCs.
Human review and green CI are required before merge; no automatic OpenSpec archive.

If the operator has explicitly deleted the kind cluster, `make k8s-setup` can
recreate it while retaining local synthetic credentials. It validates the stale
local kubeconfig names/loopback endpoint first and never targets another cluster.
Deleted cluster PVC data cannot be recovered by setup. Existing clusters with
missing/mismatched credentials or kubeconfig still fail closed.
Concurrent mutating CLI operations use an operation lock; wait for the active
command to finish. Stale locks are reclaimed only after verifying the PID no
longer exists. Unexpected lock contents require local inspection.
