# Architecture Principles — Atlas Workspace Lab

**Status:** Adopted as PoC design guardrails (not a claim of adoption by any other project).
**Scope:** Public educational PoC; TypeScript/React and Java only; no private source, tenant data, or internal company identifiers.
**Ownership:** Repository owner reviews exceptions and cross-component decisions.
**Application:** Requirements, OpenSpec changes, architectural reviews, code reviews, CI/CD, and release evidence.

These principles express a generic reference architecture. The demo intentionally implements only a small subset; future-facing capabilities are **design constraints, not a mandate to build speculative services**.

## Architecture and contracts

### P01 — Minimal AI coordination core
Agent orchestration coordinates execution; domain services own business rules, knowledge, models, tools, and policy enforcement. Prefer framework-native abstractions over unnecessary homegrown wrappers. Agent runtime is **not needed for the first demo story**.

### P02 — Explicit ownership and independent lifecycle
Each deployable component has one bounded responsibility, clear owner, independent build/test/version/deploy lifecycle, and exclusive logical ownership of its writes. No direct access to another service's private tables. Shared infrastructure may host separate namespaces/schemas with distinct credentials.

### P03 — Contract first
Define and review versioned OpenAPI for HTTP APIs, AsyncAPI for events, and versioned workflow activity contracts before implementing inter-service behavior. Validate compatibility and consumer expectations through tests; avoid accidental breaking changes.

### P04 — Standardized AI interoperability
Where AI is implemented, use official AG-UI/SSE, MCP, and A2A SDKs/adapters with compatibility and conformance checks. Do not invent protocol implementations or silently downgrade versions. These integrations are **out of scope for LAB-101**.

### P05 — Operationally justified complexity
Logical service boundaries do not require dedicated clusters or oversized infrastructure. Justify each independent deployment and platform component by learning goals, measured load, maintenance cost, and team capability. Prefer simple local Docker-based development.

## Security, tenancy, and data

### P06 — Zero trust and least privilege
Use external OIDC for real authentication scenarios and scoped authorization (RBAC/ABAC/ReBAC as relevant). Deny by default; every domain service enforces resource-level permissions, not just API-edge identity checks. In this demo, no production identity integration is required; any privileged mock must be explicitly labeled non-production.

### P07 — Authenticated workload identities
Production design favors workload identities, mTLS, restrictive network policies, least-privilege egress, managed credentials, and KMS-backed secrets. Never commit secrets or embed credentials. For local demo, use ephemeral test values and document simplified trust boundaries.

### P08 — Tenant isolation end to end
Every persistent, cached, retrieved, or streamed resource carries an authorized tenant scope. Enforce scope and revocation consistently across storage, queues, object storage, and search. Do not simulate cross-tenant isolation by filtering only in the UI.

### P09 — Residency, retention and deletion policy
A production system must apply explicitly approved region policies to inference, primary/derived data, backup, logs and telemetry, with tenant-specific retention/deletion obligations. A US-primary default may be evaluated as a reference assumption, not hardcoded into the demo. Use only synthetic PoC data.

### P10 — AI security and auditable delivery
Treat untrusted content as data, not instructions. Apply independent AI security controls when AI is introduced, alongside normal domain access checks. Preserve redacted append-only audit trails where applicable, and follow signed-artifact, dependency provenance and software supply-chain practices appropriate to the PoC.

## AI quality and safe automation

### P11 — Grounded, authorization-aware answers
If retrieval/AI answers are introduced, use ACL-filtered hybrid retrieval, source citations and relevance checks; abstain rather than produce unsupported factual claims. No RAG or model integration is necessary for the first asset-processing exercise.

### P12 — Versioned document processing
If document ingestion is implemented, separate metadata/ACL ownership from parsing, chunking, embedding and indexing responsibilities. Prefer immutable input artifacts, parser quality checks, structure-aware chunking and independently testable worker stages. LAB-101 may demonstrate only basic safe processing, leaving embedding and indexing deferred.

### P13 — Controlled model/provider dependence
Where models are needed, route through a provider-neutral gateway for credentials, quotas, routing, cost, failover and model/version observability. Index/embedding migrations must be versioned and reversible. Do not introduce a gateway before a real AI use case exists.

### P14 — Policy gates before autonomous actions
Evaluate relevant risk before and after AI-generated actions. Deterministic hard stops override probabilistic scores. If a required risk check is unavailable, block automated delivery; fail closed. Human sign-off is mandatory where specified.

### P15 — Human control and measured AI quality
Bind approvals to the exact proposed artifact/draft version; record reviewer, time, decision and reason. Add independent AI evaluation and regression/conformance tests when AI is introduced. Long-term memory is opt-in only. For this PoC, **human OpenSpec approval before coding is mandatory**.

## Reliability and engineering delivery

### P16 — Durable, recoverable asynchronous execution
When workflows need durability, use a suitable durable workflow engine; event transport uses versioned events, transactional outbox (where atomicity is needed), idempotent consumers, retry limits, cancellation and deadlines. Compute should remain stateless wherever practical; persistent checkpoints require explicit ownership. Kafka and Temporal are candidates, not mandatory for the initial scaffold.

### P17 — Fair scaling and backpressure
Use admissions, quotas, tenant fairness, bounded queues, backpressure, concurrency limits and workload-specific scaling where load demands them. Streaming must support safe reconnect/replay when implemented. Measure capacity and cost attribution rather than claim unverified scalability.

### P18 — Prove reliability with tests
Define service-level SLO/error budgets, failure-mode tests, availability and regional recovery goals. A multi-AZ primary, regional standby, RTO ≤30 minutes and RPO ≤5 minutes may serve as **reference planning targets**, not demonstrated PoC guarantees. Never claim production availability from local tests.

### P19 — SDD and automated quality gates
Use OpenSpec to record proposals, specifications, design and implementation tasks. No feature code before explicit human spec approval. Apply SOLID, Clean Code, strict TypeScript and the approved React/Vite/Vitest/Playwright/React Query/Router/Zod stack as relevant. Automated source test coverage must be ≥75% **once coverage instrumentation is configured**, with meaningful E2E happy paths for completed features. Java builds and test gates apply to all JVM modules.

### P20 — Controlled versions and architecture evolution
Prefer actively supported LTS runtime releases where an LTS channel exists; otherwise approved supported stable versions. AI protocol SDKs may use approved latest stable versions; pre-stable exceptions require documented security, compatibility, conformance, rollout and rollback safeguards. Use immutable artifacts and GitOps promotion when deploying. Proposed ADR changes require recorded approval.

### P21 — Typed, validated low-latency inference
Where appropriate, treat small/fast classification and scoring models as first-class typed capabilities, independent of specific agent frameworks and providers. Document precision/recall, calibration, abstention, fallbacks, monitoring and traceability. Probabilistic predictions **never override** deterministic authorization, risk hard stops or mandatory human approvals. No model is required by LAB-101.

## Enforcement matrix

| Control | Where enforced | Timing |
| --- | --- | --- |
| OpenSpec approval and issue traceability | `openspec/changes/**`, PR template, reviewer | Before feature implementation |
| Cross-service boundaries | Each module and contracts; static guardrail check | Every PR |
| API/event compatibility | OpenAPI/AsyncAPI validation and contract tests | When integration contracts change |
| Security & tenant scoping | Service tests, API contracts, review | On security-sensitive features |
| Coverage and E2E | Unit/integration/E2E CI | As features are implemented |
| Build independence | pnpm/Nx and Gradle checks | Every affected build |
| Version/release discipline | PR review, dependency checks, signed artifacts | Before release |
| AI protocol/model quality | Conformance/evaluation/security gates | Only when AI introduced |

## Exceptions and governance

Every exception must document rationale, affected principles, scope, mitigations, owner, expiry/review date and rollback. The owner must approve it before implementation. A PoC simplification is not automatic authorization to weaken a future production design.

## Demonstration boundary

LAB-101 is deliberately about safe sample asset processing. It exercises P02, P03, P05, P06, P12, P16 and P19 most directly; other principles are retained as guardrails for extensions rather than requirements to deploy a full enterprise platform.
