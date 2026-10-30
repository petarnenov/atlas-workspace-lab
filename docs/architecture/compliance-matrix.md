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
