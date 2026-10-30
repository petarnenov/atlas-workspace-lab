# LAB-101 — Upload and Process a Sample Asset

**Status:** PROPOSED — NOT APPROVED FOR IMPLEMENTATION
**Issue:** https://github.com/petarnenov/atlas-workspace-lab/issues/2

## Why
Validate spec-driven cross-service development using React/TypeScript and Java without proprietary product behavior.

## Proposed scope
- React portal presents a demo upload UI and processing state.
- Asset service validates and stores synthetic asset content and metadata.
- Java processing worker handles an asynchronous processing event.
- Workspace API exposes the asset processing status.
- OpenAPI and AsyncAPI contracts define interactions.

## Explicitly out of scope
- Python; production AI/LLM providers; proprietary names, endpoints or data.
- Real company identity provider or permission model.
- Kubernetes production deployment.

## Human approval gate
Do not implement LAB-101 until proposal, specification, design and tasks have been reviewed and approved by the repository owner. Changes beyond approved scope require renewed approval.

## Architecture principles required for approval
- P02: independent service ownership and data writes
- P03: OpenAPI and AsyncAPI contracts approved first
- P05: minimal local dependencies, no speculative platform
- P06/P08/P10: input security, access controls and synthetic-only data
- P12: owned metadata and immutable processing inputs
- P15: human review of the exact OpenSpec change revision
- P16: idempotent event processing and explicit retries
- P19/P20: measured test evidence and controlled versions

Refer to `docs/architecture/principles.md` and `docs/architecture/compliance-matrix.md` for all P01–P21.
