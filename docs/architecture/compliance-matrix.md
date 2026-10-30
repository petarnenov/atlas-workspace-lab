# Architecture Compliance Matrix — PoC

**Status:** Local LAB-101 implementation verified; CI and human review tracked
in [delivery evidence](../implementation/LAB-101-EVIDENCE.md). No production compliance claim.

| ID | LAB-101 application | Evidence / review target |
| --- | --- | --- |
| P01 | Deferred AI orchestration | Verify no AI runtime dependency |
| P02 | Applicable | Isolated Java services, ownership, independent builds |
| P03 | Applicable | OpenAPI/AsyncAPI reviewed before endpoints/events |
| P04 | Deferred | No custom AI protocol implementation |
| P05 | Applicable | Explain each selected runtime dependency |
| P06 | Applicable | Explicit demo security boundary; validate input |
| P07 | Reduced local mode | No production identity claims; secrets never committed |
| P08 | Applicable | Verified signed tenant scope, tenant-safe reads, event checks, cross-tenant negative tests |
| P09 | Design constraint | Synthetic data only; no real residency promise |
| P10 | Applicable | Dependency checks and redaction policy |
| P11 | Deferred | No RAG or cited generation |
| P12 | Partially applicable | Version metadata and immutable asset processing |
| P13 | Deferred | No model/provider chosen |
| P14 | Deferred | No autonomous external delivery |
| P15 | Applicable | Human OpenSpec signoff and PR review |
| P16 | Applicable | Async failure/retry/idempotency acceptance tests |
| P17 | Design constraint | Bounded queue/workload assumptions |
| P18 | Applicable | Reliability testing evidence only, no DR claims |
| P19 | Applicable | SDD, >=75% measured coverage and E2E feature path |
| P20 | Applicable | Stable versions, pinning and PR change control |
| P21 | Deferred | No inference/scoring implemented |

## Mandatory review artifacts
- Issue link and exact OpenSpec proposal revision approved by a human
- Affected components and explicit scope exclusions
- API/event contract version and compatibility evidence
- Validation, authorization and failure-case tests
- Measured test coverage and cross-service E2E evidence
- Build/CI logs, security checks and rollback notes

Deferred means "not yet built", **not** a waiver of the principle when it becomes applicable.

## LAB-103 local Kubernetes delivery

The approved OpenSpec `lab-103-local-kubernetes` applies P02/P03 by preserving
service-owned databases, scoped object identities and unchanged versioned contracts.
P05 is justified by the explicitly requested local Kubernetes learning target;
no cloud, public ingress, operators, service mesh or AI infrastructure is deployed.
P06/P07/P10 use separate immutable Secrets, no runtime API tokens, non-root pods,
capability drops, seccomp, tested default-deny traffic and scanned pinned images.
P08/P09 retain synthetic-only tenants/data. P12/P16 preserve the bounded parser,
outbox and worker checkpoints. P17 uses single replicas and resource limits without
scale claims. P15/P18/P19/P20 are enforced through exact spec approval, measured
helper/probe coverage, real kind E2E and failure tests, CI and human PR review.
Cluster/PVC deletion is explicitly destructive; stop/up preserves existing PVCs.

## LAB-104 Helm demo environments

Approved revision `0cfb4d6` preserves P02/P03 service ownership and versioned
contracts while giving each application an independent Helm release. P05 keeps
the same kind cluster and two small charts; no cloud, ingress, operators or AI
infrastructure is added. P06–P10 use separate namespaces, scoped immutable
Secrets outside Helm values/history, fixture signing keys, restricted pods and
preserved default-deny policies, including cross-environment denial proofs.
P15/P19 bind implementation to the exact owner-approved specification. P16–P18
retain idempotent bootstrap, bounded failures, retained PVC recovery and measured
runtime tests; two stateless replicas are explicitly not an HA claim. P20 pins
Helm/checksums and immutable images and requires explicit compatible rollback.
P01/P04/P11/P13/P14/P21 remain deferred AI guardrails; no model features are added.
CI and human review remain mandatory before merge.
