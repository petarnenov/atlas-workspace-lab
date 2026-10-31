# LAB-108 — Full runtime refactoring and dev-first delivery

Revision 1. Status: PROPOSED, awaiting exact owner approval. Synthetic story
LAB-108: make the existing demo conform to ADR-0001/0002 and the requested
worktree/dev/promotion policy in proposed ADR-0003.

Refactor all existing backend components, not only the LAB-106 parser path:
asset-service, workspace-api, processing-worker, Docling parser and demo-support.
Keep the existing frontend behavior; change its parsed-copy consumer only where
the reviewed neutral document contract requires it. No speculative UI rewrite.

Eliminate all 148 currently inventoried findings in eight files through actual
dependency/policy extraction. Do not approve or expand the pending LAB-107 debt
baseline. Completion requires a zero-finding strict audit across all source,
including newly classified files, and semantic architecture review.

Use existing PostgreSQL, Kafka and RustFS. Derived artifacts become an explicitly
owned capability of asset-service, alongside its metadata/authorization lifecycle,
behind a replaceable ArtifactStore. Worker owns execution/fencing/outbox only;
parser owns conversion only. No new deployable artifact microservice, workflow
engine, model, RAG, plugin framework or infrastructure product.

Affected contracts: additive neutral parser HTTP v2; asset-owned artifact staging
and reads; processed event v2; public parsed-read v2; compatibility routing for
existing v1 reads/events. Exact contract fields and transitions: contracts.md.
Original upload API and uploaded event v1 remain compatible. New artifact-write
identity and storage permission boundaries require this review before coding.

Applicable principles: P01–P03, P05–P10, P12, P15–P20. P04/P11/P13/P14/P21 remain
guardrails; no AI/model capability is added. Python remains restricted to the
already approved Docling component and its tests/build.

Development: isolated worktrees, reviewed integration into dev, dev mode only,
all applicable checks locally; hosted workflows only on dev-to-main promotion.
No runtime code, active contracts, credentials, data, CI triggers or repository
settings are changed by this specification revision.
