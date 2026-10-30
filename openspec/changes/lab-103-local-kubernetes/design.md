# Design — revision 1

## Runtime and packaging

Dedicated kind cluster atlas-lab, namespace atlas-lab; never deploy into the
operator's current context implicitly. Every kubectl call uses an explicit
validated kind-atlas-lab context and namespace. Reject a context/name mismatch.
Cluster setup installs no host tools silently and never alters unrelated clusters.
Pin a supported stable kind release, compatible supported Kubernetes node image
by digest, kubectl version compatibility, CNI/policy enforcement images and runtime
base images in a checked-in version inventory. Verify checksums for downloads.
Use built-in policy enforcement only if demonstrated; otherwise install the
minimal pinned Kubernetes SIG Network policy enforcement component. Readiness
must include a negative connectivity test; a present NetworkPolicy is not proof.

Build immutable images for workspace API, asset service, worker (including its
separate bounded parser JAR), and static UI with same-origin /api reverse proxy.
Use a supported non-root static web server; no Vite development server in cluster.
Use existing derived PostgreSQL/Kafka/bootstrap images and digest-pinned RustFS.
Load local content-addressed image tags into kind; record image IDs and prohibit
mutable latest tags. Java listeners bind to pod interfaces only through Kubernetes
environment overrides, leaving local configuration unchanged. Package existing
SQL/storage policies without exposing host source or credentials to build context.

Deploy stateless apps as single-replica Deployments. Use one StatefulSet/PVC per
PostgreSQL, Kafka and RustFS. Preserve separate database owners and existing
worker-only checkpoint storage and read-only object identity. Use internal DNS
and ClusterIP services, Kafka internal advertised listener, no database/broker/S3
host ports. Expose UI only through a foreground loopback port-forward on 5173.
No external LoadBalancer, NodePort, ingress or persistent cloud registry.

## Credentials and traffic

Generate a separate ignored .local/k8s credential/key set and kubeconfig for this
cluster; never reuse Compose identities implicitly. Repeated setup reuses complete
state and rejects partial state. Existing cluster secrets and persisted stores
must match local state; fail without overwriting on mismatch. Do not commit or
log secret manifests, token contents or key material. Inject separate Secrets per
consumer, mounting only required keys; no admin credentials in app pods. API has
fixture verification public key and service signing private key; asset/worker
receive only required verification keys. Runtime service accounts have no API
permissions and disable token automount. Local cluster administrators remain a
trusted boundary; Kubernetes Secrets alone do not provide encryption at rest.

Default-deny ingress/egress; explicit DNS and only required UI→API→asset,
asset/worker→PostgreSQL/Kafka/RustFS, Kafka internal and bootstrap-job traffic.
Bootstrap Jobs alone receive administrative credentials and bounded retry/deadline.
Use non-root processes, drop capabilities, disallow privilege escalation, resource
requests/limits and seccomp RuntimeDefault; read-only roots where supported with
explicit writable volumes for database/log/tmp/parser needs. Document any upstream
image constraint before changing reviewed security boundaries. No privileged app
pods; cluster system networking privileges remain scoped to cluster infrastructure.

## Startup and operation

Make targets: k8s-doctor, k8s-setup, k8s-build, k8s-up, k8s-dev, k8s-status,
k8s-logs, k8s-stop, k8s-test, k8s-security. Existing make token can consume the
Kubernetes fixture key through an explicit documented mode or a k8s-token target,
without printing credentials except the intentionally requested synthetic token.

Doctor validates host prerequisites, cluster tool versions/resources and intended
context without mutations. Setup creates/reuses dedicated cluster and credentials.
Build assembles artifacts/images and loads them. Up reconciles reviewed manifests,
waits for stateful readiness, runs idempotent bootstrap jobs, then starts apps.
All waits have finite deadlines; failed init prevents dependent app rollout and
returns nonzero with sanitized diagnostics. Reapply does not rotate credentials,
recreate healthy volumes or overwrite authoritative data. Use process/HTTP probes
that actually reflect component health; worker readiness checks Kafka subscription
and checkpoint connectivity rather than a nonexistent web endpoint. Avoid restart
storms on transient downstream failure.

Dev performs setup/build/up and foreground port-forward; Ctrl+C ends owned forwards,
leaving cluster data intact. Stop scales applications and stateful dependencies to
zero and ends owned forwards while retaining PVCs, secrets and cluster. Up restores
replicas and verifies recovery. No automatic namespace/cluster/PVC deletion or
credential regeneration. Explicit destructive teardown is documented separately
and excluded from default Make workflows. Cluster deletion loses local PVC data;
no backup/DR or production availability claim.

## Verification and delivery

Validate rendered manifests, supported API schemas, no plaintext secrets, policy
selectors, pod privileges, image versions and resource/probe settings. Test helper
logic with ≥75% measured lines/branches/functions and failure-path coverage.
Add disposable kind CI job with actual deployment and browser upload-to-COMPLETED
happy path using static UI. Parameterize E2E base URL/lifecycle so Kubernetes tests
never spawn host application harnesses or run docker-compose failure fixtures.
Preserve existing Compose tests. Test tenant denial, worker restart recovery,
PVC persistence after pod recreation/stop-up, duplicate delivery, network denial,
failed init/deadline, wrong context and repeated setup/up. Scan all new application,
UI, dependency images and manifests; retain sanitized evidence. Capture resource
requirements from measurement, not an unverified capacity claim.

Rollback uses previous reviewed image/manifests with compatible schema and matching
credentials, preserving PVCs. Do not automatically roll back across incompatible
schema changes. Submit PR with approvals, version inventory, checks and limitations;
human review and green CI precede merge; no automatic OpenSpec archive.
