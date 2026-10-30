# Repository Strategy — Evaluation Proposal

**Status:** Proposed, not accepted as a production architecture decision.

## Hypothesis
A domain-oriented polyglot monorepo supports independent Java services and React/TypeScript development with versioned contracts, without the early overhead of many repositories.

## Measurements
- Cold/warm builds and affected-only checks.
- Independent service build artifacts.
- Cross-service API/event compatibility and versioning.
- Developer setup effort, CI duration and caching.
- OpenSpec + Codex workflow with human approval and PR evidence.

## Alternatives
Hybrid repository strategy; domain-oriented multirepo.

## Guardrails
Repository co-location does not imply a monolithic deployment, shared domain persistence, or unrestricted cross-service imports.
