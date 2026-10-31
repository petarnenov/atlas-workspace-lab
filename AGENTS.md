# Codex Engineering Contract — Atlas Workspace Lab

This is a **public independent demonstration repository**. Never introduce proprietary code, company or customer names, internal URLs, sensitive project documents, live tokens, secrets, or tenant data.

## Mandatory architecture principles
Read **[docs/architecture/principles.md](docs/architecture/principles.md)** before designing, proposing or changing code. **All P01–P21 are binding design guardrails**, with applicability determined by the component and feature. The PoC deliberately does not deploy speculative AI, RAG, orchestration or multi-region infrastructure. Do not weaken a principle because a capability is deferred.

### Directly applicable rules
- P01/P02: coordination stays separate from domain ownership; no imports into another service's private source and no direct writes to another service's data.
- P03/P04: contract-first, versioned OpenAPI/AsyncAPI; standard AI SDKs only when AI protocols are introduced.
- P05: smallest operationally credible design and no unused infrastructure.
- P06–P10: default-deny, scoped access, no secrets, tenant-safe handling and secure/synthetic data.
- P11–P15/P21: source-grounding, risk gates, independent AI evaluation and human controls **if** model functionality is added.
- P16–P18: idempotency, explicit failure/retry semantics and verified (not assumed) reliability.
- P19/P20: SDD, tests, 75% measured source coverage for implemented features, E2E happy paths, controlled version policy.

## Approved technology boundary
- Frontend: TypeScript, React, Vite, Vitest. Other approved frontend libraries as needed.
- Backend and workers: Java and Spring Boot, Gradle, supported LTS JDK.
- Python is allowed only in `services/docling-parser` and its tests/build (approved LAB-106 exception); all other backend/worker code remains Java. Monorepo orchestration evaluated with Nx and pnpm.
- This PoC is not a clone of any company system.

## Required SDD flow
Read the architecture decision register in `docs/architecture/adr/README.md`
before proposing a design. Follow accepted ADRs; proposed ADRs need exact owner
approval, never silently report them as accepted. LAB-107 revision 1 records the
requested hexagonal/microkernel and replaceable artifact-store target.

Every proposal must identify application-owned ports/types, dependency direction,
bootstrap bindings, data/lifecycle ownership and substitution tests. Explain how
parser and storage can change without changing use-case source. Independent
deployment is not proof of replaceability. Compare storage alternatives and
document consistency/recovery across storage boundaries. List existing violations
explicitly; PoC scope, coverage or human spec approval is not an architecture waiver.

1. Link the work to a GitHub Issue (or synthetic Jira-style story).
2. Propose an OpenSpec change containing proposal, specs, design and tasks; record applicable P-principles and affected contracts.
3. Require **explicit human approval of the exact specification revision before feature implementation**.
4. Modify only reviewed scope. If a contract or security boundary changes, update specs and request another review.
5. Implement tests for happy and failure paths; run affected checks, coverage and security checks.
6. Submit PR with issue, spec, approval evidence, affected components and build/test evidence.
7. Do **not** merge, archive a change or bypass CI protections without human review.

Architecture policy/baseline changes require explicit review. Never automatically
accept scanner findings, hide new files under legacy exceptions or claim a passing
ratchet means all existing code complies. Preserve existing security/fencing
guarantees when proposing ports or moving document content.

## Escalation
If a proposed feature conflicts with a principle, stop feature work, document an exception with rationale, safeguards, owner and rollback, and request approval.

## Definition of Done
Applicable approved OpenSpec scenarios implemented; versioned contracts validated; security failure cases tested; meaningful unit/integration/E2E tests; CI checks passed; reviewer approved. Never report a local/demo stub as production-ready.
