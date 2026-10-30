# Design — revision 1

## Chart and release ownership

Use two first-party charts under infra/helm: atlas-platform and atlas-component.
The component chart has a validated component enum and is installed four times,
one release per application. There is no umbrella release containing all apps:
upgrading asset-service must not change another application's Helm revision.
Each release owns only its component Deployment and Service. The platform release
owns PostgreSQL/Kafka/RustFS StatefulSets and internal Services, storage policy
ConfigMap and the environment's shared default-deny/allow network policies.
Keep the separate headless Kafka governing service and stable client ClusterIP.

The namespace and per-consumer immutable Secrets are prepared outside Helm and
never embedded in a chart, Helm values or release history. Runtime pods receive
only their existing scoped keys/passwords. No generated random secret/template
functions, plaintext credentials, admin app credentials or runtime API token mounts.
Charts refer to existing Secret names/keys; setup reuses complete matching local
state and rejects missing/partial/mismatched state without rotation or overwrites.

Use ordinary chart templates and small shared template helpers. Add JSON Schema
validation of environment/component enums, image references, replicas, resource
settings, service names and credential references. Reject unsupported configuration
instead of passing arbitrary manifests or shell options through values. Both
profiles keep the existing non-root, read-only filesystem, seccomp, capability,
probe and network controls. Changed helper source has measured coverage gates.

## Environment profiles

Store reviewed values-dev.yaml and values-prod.yaml with charts, with no secrets
or real endpoint/domain identifiers. Both explicitly identify a synthetic demo.
Use atlas-dev and atlas-prod namespaces in kind-atlas-lab. Reuse DNS service names
inside each namespace, but scope all application/dependency network peers to that
same namespace; only the existing explicit DNS exception crosses namespaces.
An app in dev must not connect to prod PostgreSQL/Kafka/S3 even if it knows the IP.

Use .local/helm/dev and .local/helm/prod for distinct local credentials, signing
keys, image/value inventories and owned forward/operation state. Credentials and
PVCs are never shared with each other or .local/k8s/atlas-lab resources. The existing
dedicated kind kubeconfig can be reused only after its current identity guard
passes; commands must never rely on the user's current/default context.

Dev: one replica of each app, current local resource baseline, loopback UI 5173.
Prod demo: two UI/API replicas, one asset service and worker, one instance of each
stateful dependency; larger declared requests/limits and loopback UI 5174.
Worker retains Recreate strategy. No claim of horizontally safe asset dispatch,
multi-broker Kafka, HA storage or durable backups is made. Doctor documents and
checks aggregate resources needed when both environments run together; it must not
silently lower replica/resource settings to fit a host.

Prod still uses fixture authentication and local trust assumptions. Documentation
must explicitly distinguish this profile from readiness for real users/data.
There is no external production target or bypass switch for an arbitrary cluster.

## Lifecycle and Make interface

Expose operations through Make; validate ENV=dev|prod and SERVICE against the four
application names before any cluster call. ENV defaults to dev and is always shown
in status output. Planned targets:

- helm-tools: explicitly install a pinned supported stable Helm 4 release under
  ignored .local/tools using official checksums; retain verified kind/kubectl tools.
- helm-doctor ENV=dev|prod: read-only prerequisites, versions, resources and identity.
- helm-setup ENV=dev|prod: create/reuse the dedicated local cluster, selected namespace
  and that environment's scoped credentials; do not deploy apps implicitly.
- helm-build: reuse existing artifact/image build machinery and single-platform
  import; keep content-derived immutable image tags. No registry push is included.
- helm-lint / helm-template ENV=dev|prod: schema/lint/render checks with no cluster
  mutation. Rendered output contains references to secrets, never secret values.
- helm-up ENV=dev|prod: install/upgrade platform then four application releases;
  wait for infrastructure, bootstrap and network proof before app rollout.
- helm-dev / helm-prod: selected demo setup/build/up and foreground loopback forward.
- helm-deploy ENV=dev|prod SERVICE=asset-service: upgrade exactly one application
  from explicit immutable image inventory, after prerequisites/credential checks;
  never upgrade platform or another application. Building images remains explicit.
- helm-status / helm-logs / helm-forward ENV=dev|prod: inspect or forward only the
  selected environment, with owned-process checks and safe signal handling.
- helm-token ENV=dev|prod TENANT=a|b: intentionally print a synthetic token signed
  only by the selected environment's fixture key; never fall back to another key.
- helm-stop ENV=dev|prod: persist zero replicas through selected environment's Helm
  values/releases and stop its owned forward; preserve PVCs, Secrets and releases.
  helm-up restores reviewed profile counts. The other environment is untouched.
  Stop does not run initialization hooks against dependencies it has scaled down;
  the next up must execute the normal initialization/proof gates again.
- helm-rollback ENV=dev|prod SERVICE=... REVISION=...: validate a known revision and
  roll back exactly that app release; no automatic schema/data rollback.
- helm-test / helm-security: run helper/contract/render and real-cluster scenario
  checks, and scan charts, rendered resources, repository and deployed images.

Mutations use an operation lock for the dedicated cluster, so native and Helm
operations cannot race against each other. Guard the exact context, namespace and
release ownership; reject existing objects belonging to another manager/release.
Never use --take-ownership, force replacement or implicit atlas-lab migration.
No default command uninstalls a release or deletes a cluster/namespace/PVC/Secret.

Pin Helm's exact version/checksums in the version inventory and test actual Helm 4
flags. Use upgrade --install with explicit kubeconfig/context/namespace, finite
timeout and readiness waiting. A failure returns nonzero and preserves inspectable
state; do not automatically remove platform resources or attempt schema rollback.
Use a separate platform phase/release with bounded idempotent bootstrap/proof Jobs
(post-install/post-upgrade hooks are allowed). Hook cleanup may delete only owned
ephemeral Jobs, never credentials/PVCs. Failed initialization blocks app install.
Retain stateful PVCs on scale/deletion and document Helm history/rollback limits.

## Source of truth and migration

Helm templates are authoritative for the new environments. Reuse existing Java/UI
Dockerfiles and pure helper routines where practical, but do not generate a second
Helm manifest set that can drift silently. Structural parity tests compare domain
images, ports, roles, probes and security policy intent with the supported LAB-103
path. Any new behavior belongs to reviewed Helm values/templates, not hidden
runtime rewrites. Existing atlas-lab resources continue under their current owner.

## Verification and delivery

Run lint/schema/render tests for both profiles and all four component releases.
Negative cases include unknown env/service, missing/mutable images, credential
misconfiguration, wrong context, ownership collision, invalid revision and failed
bootstrap/readiness. New helper source must achieve >=75% measured lines/branches;
retain the repository's existing function coverage gates where configured.

Disposable kind CI installs both profiles, proves browser upload-to-COMPLETED,
unauthenticated/cross-tenant denial, network default-deny including dev-to-prod,
worker restart/duplicate handling, dependency recreation and stop/up persistence.
Verify exact prod replica counts and browser/API functionality across replicas.
Upgrade one app image (a harmless image metadata revision is sufficient), verify
only its release revision changes, and explicitly roll back that app with its
functional check passing. Render/scan all images and resources for both profiles;
retain sanitized evidence without key material, tokens or uploaded contents.

Existing versioned contract, native Kubernetes and Compose checks remain required.
PR includes LAB-104, exact approval, principles, chart/tool versions, affected
components, tests/security evidence and rollback instructions. Green CI and human
review precede merge; no automatic merge or archive.

Implementation references: official Helm chart/schema documentation
https://docs.helm.sh/docs/topics/charts/ and Helm 4 upgrade/wait behavior
https://docs.helm.sh/docs/helm/helm_upgrade/ . Verify chosen pinned release against
official distribution metadata before installation.
