# LAB-104 — Helm dev/prod demo operations

Synthetic story: LAB-104. Approved OpenSpec revision 1: `0cfb4d6`.
This is a local single-node demonstration. `prod` names a second demo profile;
fixture tokens, singleton persistence and local PVCs do not provide production
identity, HA, backup, disaster recovery or production availability.

## Prepare and start

Host prerequisites remain JDK 21, Node 24, pnpm 10 and Docker. Both profiles
require at least four Docker CPUs and 10 GiB Docker RAM. Tools are installed only
by explicit Make commands; Helm 4.3.1 downloads are checksum verified.

```sh
make setup
make helm-tools
make helm-doctor ENV=dev
make helm-dev                  # setup/build/up + foreground loopback :5173
# Another terminal, or after Ctrl+C:
make helm-prod                 # independent demo, loopback :5174
```

Ctrl+C ends forwarding and keeps pods/data. Native Kubernetes/Compose UI uses
5173 too: stop its forwarding before opening Helm dev. The native `atlas-lab`
namespace and Compose data remain separate. No migration or resource takeover
is performed. Commands share the native Kubernetes mutation lock; do not run
independent lifecycle/test commands concurrently.

For each environment the individual steps are also available:

```sh
make helm-setup ENV=prod
make helm-build ENV=prod
make helm-lint ENV=prod
make helm-template ENV=prod
make helm-up ENV=prod
make helm-forward ENV=prod
make helm-token ENV=prod TENANT=a
make helm-status ENV=prod
make helm-logs ENV=prod
```

Use the token only with its selected synthetic environment. `TENANT=b` selects
the second fixture tenant. Do not publish these demo endpoints.

## Release and data ownership

Each namespace, `atlas-dev` or `atlas-prod`, contains five releases:
`atlas-platform`, `atlas-workspace-api`, `atlas-asset-service`,
`atlas-processing-worker`, `atlas-portal-ui`. The platform owns PostgreSQL,
Kafka, RustFS, service networking and bounded bootstrap/proof Jobs. Each app
release owns only its Deployment and, when applicable, its Service. Up installs
platform first, then API, assets, worker and UI. Failed commands stop with an
error and retain evidence/resources; inspect status/logs before retrying.

The two first-party charts are `infra/helm/atlas-platform` and
`infra/helm/atlas-component`. Reviewed JSON-form YAML values and strict schemas
reject unsupported environments, mutable image tags, fixture-mode removal and
unsupported replica counts. Every image has a content-derived immutable local
tag. `helm-build` builds/loads all images and records the selected environment's
inventory; `helm-deploy` deploys only the named application.

Dev has one replica of all seven workloads. Prod demo has two UI and API replicas,
one asset service, worker and each dependency. Both retain singleton Kafka,
storage and database; additional API/UI replicas do not establish HA. Resource
requests and limits are explicit in each reviewed profile. The worker uses
Recreate rollout to preserve its single-consumer readiness contract.

Credentials and RSA fixture keys live under ignored `.local/helm/dev` and
`.local/helm/prod`. Setup owns six scoped immutable Kubernetes Secrets outside
Helm; only their names enter chart values/history. Namespaces carry restricted
Pod Security labels. Every mutating operation validates the dedicated
`kind-atlas-lab` context, namespace ownership and matching credentials. Existing
unowned resources cause failure. Setup reuses credentials; partial/mismatched
state fails closed. Restore matching local state rather than regenerating it
against retained PVCs. Secrets do not imply encryption at rest.

## Independent application deploy and rollback

```sh
make helm-build ENV=prod
make helm-deploy ENV=prod SERVICE=workspace-api
# Inspect revision numbers in Helm history:
.local/tools/helm --kubeconfig .local/k8s/kubeconfig --kube-context kind-atlas-lab \
  --namespace atlas-prod history atlas-workspace-api
make helm-rollback ENV=prod SERVICE=workspace-api REVISION=1
```

Deploy requires a ready platform and updates exactly one application release.
Rollback is explicit and accepts only a successful compatible application chart
revision in the selected environment. It restores the selected image inventory;
other app/platform releases and the other environment are untouched. Platform
rollback, arbitrary charts, automatic rollback and credential rotation are not
supported. Review compatibility before rolling back future contract changes.

```sh
make helm-stop ENV=dev
make helm-up ENV=dev
```

Stop scales only installed selected-environment releases to zero, disables
bootstrap hooks, ends its owned forward and retains releases, PVCs and Secrets.
Up restores reviewed replicas and reruns bounded bootstrap/network proofs.
Neither stop nor setup deletes persistent data. Cluster or PVC deletion is a
separate destructive operation requiring a deliberate retention decision.

## Verification

With both environments running and no manual forwards:

```sh
make helm-test
make install-trivy
make helm-security
make check
```

Tests enforce helper coverage of at least 75%, validate both chart profiles and
failure paths, and exercise real browser/API processing, tenancy, malformed
uploads, retry/idempotency, worker/dependency recreation, stop/up persistence,
exact replicas, both API replicas, cross-environment token/network denial and
independent upgrade/rollback. The platform runs positive and negative network
proof Jobs before applications start. The security command scans chart sources
for secrets, every effective rendered profile as Kubernetes resources, all unique
workload images, repository dependencies and secrets. Reports are ignored under
`.local/helm/security`; credentials and tokens must never become CI artifacts.

The Helm CI job repeats both environments on Linux kind. Existing native
Kubernetes and Compose/application CI gates remain required. Local results do
not replace green CI and human PR review.
