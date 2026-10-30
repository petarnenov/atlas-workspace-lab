# LAB-101 Technical Design — Draft for Review

## Boundaries
- `portal-ui`: view and upload interaction.
- `workspace-api`: client-facing processing status.
- `asset-service`: asset validation, metadata and storage ownership.
- `processing-worker`: asynchronous processing implementation.
- `contracts/openapi` and `contracts/asyncapi`: source of truth for wire contracts.

## Proposed interaction
1. Portal UI sends an asset-upload request through an explicitly versioned API.
2. Asset service saves metadata, then publishes `AssetUploaded`.
3. Java worker consumes an event, processes the asset and publishes `AssetProcessed` or `AssetProcessingFailed`.
4. Workspace API returns the current state to the UI.

## Review questions
- Which API owns upload routing?
- What are the file limits and allowlisted MIME types?
- Which broker/storage should the PoC use first?
- How is status projection updated from the worker event?
- What are event idempotency and retry policies?
- What should be mocked vs integrated in the first iteration?

This design is intentionally incomplete; approve answers before coding the feature.
