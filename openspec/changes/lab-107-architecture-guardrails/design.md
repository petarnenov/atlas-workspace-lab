# Enforcement design — revision 1

## Approval and policy

ADR-0001/0002 define the accepted target. Owner approved exact revision 1
(f737615); see approval.md. Contracts must be minimal and reusable. The generated
initial debt inventory still requires separate explicit owner review.

Use Node 24 built-ins, no network/services. Preserve existing check-architecture
rules and import the new checker. A versioned docs/architecture/policy.json defines
backend roots, layer paths, allowed edges, composition roots and provider-specific
adapter/contract boundaries. New backend files must be classified; no default
legacy exemption. Validate schema, unknown fields, paths and missing declared roots.

## Rules

Reject core imports/qualified references to adapters, Spring, JDBC/java.sql,
java.net.http, filesystem storage, AWS/S3 SDKs and provider-owned types. Ports
cannot expose ParserClient.Parsed or equivalent adapter results/errors. Reject SQL
and persistence operations in inbound controllers/listeners, provider branches in
use-case policy, and DoclingDocument requirements in neutral core contracts.
Allow provider schema checks inside explicitly declared outbound boundaries.
Apply analogous dependency checks to future Python core layers; the existing
converter is an adapter. Defaults must cover new files under legacy roots.

Distinguish comments/literals from executable dependencies; inspect contract data
deliberately. Document supported syntax and limits. Static scans cannot prove
reflection behavior, actual wiring or substitution; tests/review remain mandatory.

## Existing debt and ratchet

First generate a read-only inventory. Never auto-accept findings. Each reviewed
baseline entry records rule/path, occurrence count, SHA-256 of the normalized
offending fragment, remediation story, owner, rationale and review date no later
than 2026-11-30. It is acknowledged debt, not compliance or an indefinite waiver.
The owner must approve the exact initial inventory before enabling the ratchet.

Every run reports remaining debt. New/increased/changed findings, expired entries,
unknown entries and stale entries for removed findings fail. No wildcard or folder
suppressions and no automatic update/accept baseline mode. Policy/baseline changes
require owner review; a passing test cannot establish human approval.
Strict audit fails on every finding. Ratchet tolerates reviewed existing debt only.

## Entry points and tests

make architecture-check: ratchet scan with debt report.
make architecture-audit: strict scan, nonzero while debt remains.
make architecture-test: negative fixtures, >=75% measured new checker source and
branch coverage. Wire the same implementation into pnpm check:architecture,
make check and existing scaffold CI, offline without images/Kubernetes.

Fixtures must reject forbidden imports and qualified SDK use, adapter DTO signatures,
SQL controllers, provider-specific neutral schemas, unclassified/moved/new files,
missing/malformed policy and stale/duplicate/expired/broadened baseline entries.
Test valid adapters/ports/bootstrap, legitimate provider-specific contracts,
comments/literals, duplicate occurrences and deterministic review-date boundaries.

## Rollback and follow-up

Tool rollback leaves runtime/data unchanged. Any temporary exception requires
explicit owner/rationale/review/rollback; no silent weakening. Runtime extraction,
adapter substitution tests and artifact migration are separate reviewed changes.
