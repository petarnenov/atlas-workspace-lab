# LAB-103 — Complete local Kubernetes runtime

Revision: 1. Status: APPROVED for implementation; see approval.md.
Tracking: synthetic story LAB-103 — As a contributor, I can start the complete synthetic demo in a disposable local Kubernetes cluster through Make.

Deploy portal UI, workspace API, asset service, processing worker, PostgreSQL,
Kafka and RustFS, including topic/bucket/identity initialization, inside Kubernetes.
Use a dedicated single-node kind cluster as the reproducible local/CI target.
Existing Compose workflows remain supported. No cloud provisioning or production
migration is included. Host tools build artifacts; runtime components all run in pods.

P05 justification: Kubernetes is an explicitly requested learning/delivery target,
not a scalability requirement. Use native manifests/Kustomize, one dedicated
namespace, existing single-instance dependencies and local persistent volumes.
No Helm/operator stack, service mesh, public ingress, cloud account, AI runtime,
RAG, Temporal or multi-region infrastructure is introduced.

Applicable: P01/P02 ownership unchanged; P03 existing versioned HTTP/event contracts
unchanged; P05 minimal local cluster; P06/P07 scoped secrets, default-deny networks
and workload privileges; P08/P09 synthetic tenants and retained local data;
P10 scanned/pinned artifacts; P12 worker/parser boundary; P15/P19 approval,
coverage and E2E gates; P16/P18 recoverable init, restart and failure tests;
P17 resource limits/single replicas without scale claims; P20 supported pinned
tools/images and reviewed manifests. P04/P11/P13/P14/P21 add no AI functionality.

Approval artifact: this proposal, design.md, tasks.md and
specs/kubernetes-runtime/spec.md together form revision 1. Any security boundary
or contract change beyond this revision requires another specification review.
