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
- Applicable accepted/proposed ADRs and explicit dependency/substitution evidence
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

## LAB-106 architectural gap / LAB-107 guardrails

LAB-106 passed behavioral, security and deployment checks but did not demonstrate
hexagonal/microkernel replaceability. At that checkpoint WorkerEvents depended
on ParserClient; Checkpoints accepted ParserClient.Parsed and stored document
bodies; ParsedHttp read SQL directly; the parser contract and client required
Docling schema/version. LAB-108 remediates those dependencies below; the earlier
behavioral checks never established architectural compliance.

LAB-107 ADR-0001/0002 revision 1 is owner-approved, with minimal reusable
contracts required. Source/contract checks and fixture tests are implemented;
the initial exact debt inventory remains pending owner review. At the LAB-107 baseline checkpoint runtime remediation
was not implemented; that gate deliberately failed on unreviewed inventory.
No whole-repository compliance claim is justified by a passing future ratchet gate.


## LAB-108 approved remediation, implementation in review

Revision 1 (`6bcb255`) authorizes the full extraction and additive contracts.
ADR-0003 requires task worktrees, reviewed integration into dev, local checks in
ENV=dev and same-repository dev-to-main hosted promotion. No implementation or
spec approval authorizes automatic merge or branch-protection changes.

| Principles | Implementation and actual evidence | Remaining limit |
| --- | --- | --- |
| P01/P02/P05 | Application-owned worker/parser/artifact ports, thin inbound adapters, bootstrap bindings; asset ownership of derived manifests/content; separate existing RustFS bucket | Semantic review remains mandatory; static inventory alone cannot prove inversion |
| P03/P12/P20 | Authoritatively validated parser/read v2, processed v2 and staging contracts; v1 compatibility; opaque provider provenance/native capability | Consumer-first rollout and explicit migration before existing-environment cutover |
| P06–P10 | Verified tenant/workload scopes, dedicated worker staging identity, separate source/derived credentials, no normal derived delete/list; real storage privilege tests | Synthetic demo identities; no production identity/retention claim |
| P16–P18 | Renewable fencing, hidden staged writes, stable outbox, verified completion/read, owner-scoped migration and rollback tests | Real backup restoration and runtime conformance evidence tracked in LAB-108 evidence; no distributed transaction/availability claim |
| P19 | >=75% measured Java source coverage and offline parser coverage; tooling/negative policy tests; meaningful integration and browser checks | Exact final candidate, all applicable local checks and human review required |
| P11/P13–P15/P21 | No model functionality introduced; exact spec approval recorded | AI evaluation and human-control requirements remain binding if AI is added |

The initial 148 scanner findings are removed from current source; the baseline is
empty and contains no accepted violations. Historical inventory is retained in
debt-review.md. Corrections to Identity/Wire/Checkpoints/WorkerEvents roles accompany
actual source extraction, rather than grandfathering mixed classes as adapters.
See [LAB-108 evidence](../../openspec/changes/lab-108-hexagonal-runtime/evidence.md)
and [runbook](../implementation/LAB-108-RUNBOOK.md) for completed versus pending
runtime, security, backup, substitution and release checks.
