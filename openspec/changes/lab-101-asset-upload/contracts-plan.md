# LAB-101 Contract Design and Review

**Status:** DRAFT — machine-readable contracts submitted for review; feature implementation remains blocked.
**Architecture decisions:** D01–D06 approved by owner; see `decision-register.md`.
**Issue:** https://github.com/petarnenov/atlas-workspace-lab/issues/2

## Submitted artifacts
- `contracts/openapi/asset-api.v1.json` — OpenAPI 3.1, version 1.0.0
- `contracts/asyncapi/asset-events.v1.json` — AsyncAPI 3.0, version 1.0.0
- `scripts/check-contracts.mjs` — local invariant checks
- `.github/workflows/contracts.yml` — OpenAPI and AsyncAPI standard validation using their CLI tools

## HTTP contract
`workspace-api` owns the public boundary:
- `POST /api/v1/assets` multipart PDF, responds `202` with `assetId`, `PENDING`, `correlationId`.
- `GET /api/v1/assets/{assetId}` returns tenant-authorized status, optimistic state `version`, timestamps and sanitized error code.
- Proposed `Idempotency-Key` allows repeat-safe upload attempts.
- Explicit error responses include 400, 401, 403, 404, 413, 415, 500 and 503 as relevant.
- Bearer security scheme describes **synthetic local demo identity only**, not production auth.

The asset service internal HTTP interface and its stricter trusted-service identity contract must be specified before implementing the BFF-to-asset-service call. The public contract alone is insufficient for that step.

## Kafka contract
This document is a logical interface inventory (both service perspectives); it is **not** intended to model a single deployable application:
- `asset.uploaded.v1`: AssetUploaded from asset-service to processing-worker.
- `asset.processed.v1`: AssetProcessed from processing-worker to asset-service.
- Both carry `eventId`, `assetId`, `tenantId`, `schemaVersion`, `occurredAt`, `correlationId`.
- The uploaded event carries an opaque `objectKey`; outcome carries COMPLETED/FAILED and optional errorCode.

## Remaining contract review topics
1. Internal asset service HTTP contract and trusted identity forwarding.
2. Document bytes vs metadata persistence ordering and failure compensation.
3. Which service enforces the idempotency key and its retention window.
4. Version/state transition semantics under duplicate and out-of-order messages.
5. The precise test identity token issuance and signing method.
6. Distinguish 403 and 404 to avoid cross-tenant resource existence leaks.
7. Producer and consumer conformance tests, plus rollback/version migration policy.
8. Confirm OpenAPI/AsyncAPI validation jobs are green.

## Gate
D01–D06 approval is recorded, but **no implementation authorization** is implied until this contract review is complete and the exact OpenSpec revision is approved for execution.
