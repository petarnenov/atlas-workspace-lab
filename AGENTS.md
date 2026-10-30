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
- No Python. Monorepo orchestration evaluated with Nx and pnpm.
- This PoC is not a clone of any company system.

## Required SDD flow
1. Link the work to a GitHub Issue (or synthetic Jira-style story).
2. Propose an OpenSpec change containing proposal, specs, design and tasks; record applicable P-principles and affected contracts.
3. Require **explicit human approval of the exact specification revision before feature implementation**.
4. Modify only reviewed scope. If a contract or security boundary changes, update specs and request another review.
5. Implement tests for happy and failure paths; run affected checks, coverage and security checks.
6. Submit PR with issue, spec, approval evidence, affected components and build/test evidence.
7. Do **not** merge, archive a change or bypass CI protections without human review.

## Escalation
If a proposed feature conflicts with a principle, stop feature work, document an exception with rationale, safeguards, owner and rollback, and request approval.

## Definition of Done
Applicable approved OpenSpec scenarios implemented; versioned contracts validated; security failure cases tested; meaningful unit/integration/E2E tests; CI checks passed; reviewer approved. Never report a local/demo stub as production-ready.
