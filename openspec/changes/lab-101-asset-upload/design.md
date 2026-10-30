# LAB-101 Technical Design — Proposed Decision Baseline

**Status:** DRAFT — HUMAN REVIEW REQUIRED. No feature implementation authorized.
**Issue:** https://github.com/petarnenov/atlas-workspace-lab/issues/2
**Reference:** docs/architecture/principles.md, especially P02, P03, P05, P06, P08, P12, P15, P16, P19, P20.

## 1. API ownership — PROPOSED
- `workspace-api` owns the client-facing BFF boundary and status GET API.
- `asset-service` owns the upload endpoint exposed to the BFF, asset validation, metadata, object-storage references, and authoritative processing status.
- `portal-ui` communicates with `workspace-api` only; `workspace-api` routes uploads to `asset-service` via a versioned REST contract.
- Neither the worker nor the BFF writes into the asset service database.
- Avoid duplicating status state in the BFF; query the authoritative asset-service read API for the PoC.

## 2. File validation — PROPOSED
- Demo accepts `application/pdf` only; maximum size **5 MiB**.
- Validate extension and content signature; never trust `Content-Type` alone.
- Reject zero-length, oversized, or mismatched inputs with clear 4xx responses.
- Assign server-side UUID identifiers, generate server-controlled object keys, never trust user-supplied filenames as paths.
- Reject unsupported, password-protected or malformed PDFs if the parser cannot safely handle them; record processing failures separately from upload rejection.
- Do not execute embedded content; processing must be bounded in time and memory.
- Never log file bytes, secrets or raw content.

## 3. Broker and storage — PROPOSED
- PostgreSQL: metadata/status storage owned by asset service.
- MinIO: S3-compatible storage of immutable demo PDF objects.
- Kafka: `asset.uploaded.v1` and `asset.processed.v1` event streams.
- Docker Compose provides disposable local resources; avoid Kubernetes and Temporal for this demonstration.
- Kafka/MinIO are intentionally present to exercise event and object boundaries, not to imply a production recommendation.

## 4. Status ownership — PROPOSED
- `asset-service` owns and persists the canonical state: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.
- `processing-worker` consumes an upload event, processes the immutable object, then emits an outcome event. Asset service consumes the outcome and updates its state.
- `workspace-api` reads asset-service status and exposes it to the UI. Frontend uses bounded polling (initially every 2 seconds while processing), stopping at terminal states.
- Include `assetId`, `version`, `status`, timestamps and sanitized failure code in the read model. No cross-service database reads.

## 5. Idempotency, consistency and retries — PROPOSED
- Use a unique `eventId` and immutable `assetId` for versioned events; include `occurredAt`, `correlationId` and `schemaVersion`.
- After persisting metadata, publish via a **transactional outbox**, not an unsafe DB-write / Kafka-send dual write.
- Consumers store processed event IDs, discard duplicates, and guard transitions by allowed-state/version checks.
- Use bounded retries (proposed 3 attempts with exponential backoff) for transient failures; malformed/permanent failures become `FAILED`.
- Specify a dead-letter or inspectable failure channel, and a reconciliation process for stuck `PENDING` or `PROCESSING` items.
- Duplicate upload requests may still create distinct assets unless an explicit API idempotency key is defined; propose optional `Idempotency-Key` for client retries and deduplication.

## 6. Security and trust boundaries — PROPOSED
- Public demo runs using synthetic documents only; no real user secrets, customer files, or proprietary data.
- Authentication is *not* production-complete: do not claim tenant isolation/zero trust based on the starter app.
- For demonstrable access control, implement a lightweight test identity fixture with two synthetic tenant IDs. Derive tenant scope from validated trusted server-side identity context, **not** from arbitrary query parameters or untrusted upload fields.
- Enforce tenant/resource checks in `asset-service` for upload and status reads, including negative cross-tenant tests. BFF forwards a verified, explicitly documented context, not client-selected authorization headers.
- No publicly exposed MinIO console or broker ports in a deployed demonstration; use local-only development defaults and ephemeral test credentials.
- Record audit correlation without exposing document content.

## Integration sequence
1. Portal UI calls `workspace-api` upload API.
2. BFF validates request envelope and forwards via versioned REST contract to `asset-service`.
3. Asset service validates and stores immutable PDF in MinIO; persists metadata and outbox record in PostgreSQL.
4. Outbox dispatcher publishes `asset.uploaded.v1` into Kafka.
5. Worker consumes event, safely processes PDF, and emits `asset.processed.v1` with success/failure outcome.
6. Asset service consumes outcome and updates authoritative status idempotently.
7. Portal UI polls status through workspace API and renders terminal success/failure.

## Required contract and test evidence before implementation
- Versioned OpenAPI documents for upload and status endpoints, including 400/401/403/413/415 and 5xx cases.
- Versioned AsyncAPI schemas for upload and processed events, with correlation and deduplication fields.
- Unit tests for state transitions, signatures, size limits and validation.
- Integration tests for object storage, transaction/outbox/event consistency and tenant isolation.
- Consumer contract tests and end-to-end happy and failure paths.
- Measured coverage >=75% once instrumentation is added; do not claim success from scaffold-only checks.

## Pending human decisions
The values and technology selections above are **proposals** and must be explicitly approved as an exact OpenSpec revision. Implementation remains blocked until that approval and contract design review. Changes to the selected choices require a new review.
