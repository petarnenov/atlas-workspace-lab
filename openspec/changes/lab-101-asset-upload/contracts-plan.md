# LAB-101 Contract Plan — Draft

**Status:** Proposal; contract implementation and coding are blocked pending review.

## HTTP API ownership
- Portal UI → workspace-api: `POST /api/v1/assets` (multipart PDF) and `GET /api/v1/assets/{assetId}`.
- Workspace API → asset-service: internal versioned upload and status endpoints.
- Successful upload response: HTTP 202, `assetId`, `status=PENDING`, optional `correlationId`.
- Status response: `assetId`, `status`, `version`, `createdAt`, `updatedAt`, sanitized `errorCode` (on failure).
- Required error cases: unsupported media (415), too large (413), invalid file (400), unauthenticated (401), forbidden tenant/resource (403), missing asset (404), internal dependency failure (5xx). Avoid resource existence leaks from unauthorized status lookups.

## Events
- `asset.uploaded.v1`: `eventId`, `assetId`, `tenantId`, `objectKey`, `schemaVersion`, `occurredAt`, `correlationId`.
- `asset.processed.v1`: `eventId`, `assetId`, `tenantId`, `outcome` (COMPLETED/FAILED), `errorCode?`, `schemaVersion`, `occurredAt`, `correlationId`.
- Transport and retry conventions remain to be finalized when producing machine-valid OpenAPI/AsyncAPI definitions.

## Contract test expectations
1. Consumer compatibility for HTTP status and error payloads.
2. Validation of required event metadata and schemaVersion.
3. Duplicate event handling and out-of-order outcome rejection.
4. Cross-tenant access refusal and untrusted identity spoofing tests.

**Next:** Once decisions are accepted, author versioned machine-valid contracts in `contracts/openapi` and `contracts/asyncapi` as a spec-only review before feature implementation.
