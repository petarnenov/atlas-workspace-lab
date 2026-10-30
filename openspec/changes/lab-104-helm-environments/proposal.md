# LAB-104 — Helm delivery for isolated dev and prod demo environments

Revision: 1. Status: PROPOSED — implementation requires exact revision approval.
Tracking: synthetic story LAB-104 — As a contributor, I can run dev and prod demo
environments through Make and deploy each application independently using Helm.

The owner clarified that prod is for demonstration. Both profiles remain local,
synthetic-only learning environments; this is not a real production deployment.

## Scope

- Add versioned first-party Helm charts, dev/prod values and values schemas.
- Use the existing dedicated kind cluster with isolated atlas-dev and atlas-prod
  namespaces, credentials, Helm release state and persistent data.
- Use four independently upgradeable application releases: portal-ui,
  workspace-api, asset-service and processing-worker. A separate platform release
  owns shared demo dependencies, scoped network policies and bootstrap operations.
- Provide Make entrypoints for tooling, validation, setup/build, whole-environment
  startup, single-component deployment, status/logs/forwarding, stop and rollback.
- Test both profiles in disposable kind CI, including cross-environment isolation,
  independent upgrade/rollback and existing upload/recovery/security behavior.

Dev uses one replica per application. Prod demonstrates two replicas for UI/API
and explicit larger resource settings; asset service, worker and stateful stores
remain single-instance until their scaling behavior is separately approved/tested.
Replica counts and resource settings are demonstration configuration, not an SLA.

Existing Compose and LAB-103 native Kubernetes commands remain supported. The new
Helm environments do not adopt, rename, delete or migrate atlas-lab resources/PVCs.
No real cloud, public ingress, registry publishing, external managed dependencies,
OIDC migration, live credentials, production data, service mesh, operators,
autoscaling, backup/DR system or AI infrastructure is introduced.

## Principles and contracts

P01/P02 preserve domain ownership and independent application lifecycle. P03 keeps
existing versioned OpenAPI/AsyncAPI unchanged. P05 justifies Helm by the requested
two-profile delivery and independent releases; no unused platform is added.
P06/P07 retain synthetic fixture authentication, per-consumer credentials,
default-deny networks and restricted workloads; prod demo does not waive these.
P08/P09 require synthetic-only data and separation between environments. P10/P20
require pinned supported tooling, immutable images and chart version discipline.
P12 preserves worker-only parsing. P15/P19 require exact approval, coverage, tests,
green CI and human PR review. P16/P18 cover bounded initialization, failure,
rollback and data retention. P17 limits replicas to verified component behavior.
P04/P11/P13/P14/P21 introduce no AI capability or speculative infrastructure.

Affected contracts: deployment configuration and Make command interface are added;
HTTP/event versions, database schemas, domain authorization and storage identities
remain unchanged. Kubernetes names are namespace-scoped. New namespace/release
ownership boundaries and parameterization are explicitly covered by this revision.

Approval artifact: this proposal, design.md, tasks.md and
specs/helm-environments/spec.md together form revision 1. No implementation is
authorized until the owner approves this exact artifact. No merge/archive approval
is inferred from specification approval.
