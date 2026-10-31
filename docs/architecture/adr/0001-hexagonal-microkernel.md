# ADR-0001 — Hexagonal boundaries and a minimal processing kernel

Status: ACCEPTED — revision 1, commit f737615; owner approval recorded in LAB-107 approval.md. Story: LAB-107.
Applies P01–P03/P05/P08/P12/P15/P16/P18–P20. Backend scope; frontend excluded.

## Context

LAB-106 provides independent deployment, but WorkerEvents depends on ParserClient,
Checkpoints accepts ParserClient.Parsed, and the worker knows Docling versions and
schema. Independent deployment did not establish architectural replaceability.
P01 describes AI coordination; the existing rules did not specify microkernel
extension points or dependency direction. This is acknowledged architectural debt.

## Decision

Use a minimal application kernel implementing use cases and sequencing, with
application-owned DocumentParser, ArtifactStore and ExecutionState ports and
neutral request/result/error types. Dependencies point adapters -> application/
ports -> domain. Bootstrap/configuration selects and wires trusted implementations.
Domain/application must not depend on adapters, Spring, JDBC, HTTP clients,
filesystem storage, object SDKs or provider DTOs. Inbound controllers/listeners
invoke use cases; SQL and provider/storage policy belong outside those adapters.

Microkernel means explicit trusted extension points, not arbitrary dynamic code,
discovery or a new plugin framework. Plugins may be out-of-process adapters.
Missing/unknown configured implementations fail startup. Document/user content
cannot select plugins, URLs, models or credentials. No new runtime is required.

Docling-specific schemas, validation and compatibility checks belong in its
adapter. Pinning remains mandatory; release pins are not application constants.
The application owns versioned ParsedDocument and opaque ArtifactRef types.
Native Docling JSON may remain a separately typed provider artifact; every caller
must not need to understand it. External provider-specific contracts are allowed
only at explicitly declared adapter boundaries, not as neutral core contracts.

## Alternatives and consequences

A concrete client is initially smaller but couples use cases to provider changes.
A dynamic plugin framework adds unnecessary operational/security complexity.
Explicit ports add a few types and tests without speculative infrastructure.
Interfaces alone are insufficient: prove consumers, implementations and bindings.

## Acceptance and adoption

Run the same processing use case with a deterministic parser and Docling adapter;
run shared artifact contract tests against a test double and selected real store.
Substitution does not change use-case source, public behavior or security policy.
Another production provider is not required just to demonstrate the boundary.
Architecture tests reject core-to-adapter/SDK dependencies and provider DTO leakage.

Existing LAB-106 is not made compliant by accepting this ADR. Runtime refactoring,
contract changes and migrations require a separate approved OpenSpec. Owner:
repository owner. Review revision 1 before acceptance and any boundary change.

## Owner clarification: minimal reusable contracts

Owner approved revision 1 and required minimal contracts for broad reuse. Include
only fields/operations necessary for the capability and its safety guarantees.
Keep provider options, deployment topology and transport types out of core ports.
Keep provenance as generic metadata; do not make Docling/native output mandatory.
Worker substitution must preserve events, identity, fencing/idempotency, retry and
completion semantics, without changes to other components. Configuration/deployment
and reviewed state migration may still be required. Breaking contract changes
need compatibility/versioning review. Minimal does not remove tenant/integrity or
failure semantics. This clarification does not authorize runtime contract changes.
