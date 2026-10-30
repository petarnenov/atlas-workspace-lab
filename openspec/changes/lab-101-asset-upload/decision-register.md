# LAB-101 Architecture Decision Review

**Status:** D01–D06 APPROVED BY REPOSITORY OWNER (user instruction, 2026-10-30).
**Approved spec revision (before this approval record):** `87079ecc3de93495a27776ddcd530d350dcbf205`
**Review source:** Explicit approval in the project conversation; recorded here for traceability.
**Issue:** https://github.com/petarnenov/atlas-workspace-lab/issues/2
**PR:** https://github.com/petarnenov/atlas-workspace-lab/pull/3

| Decision | Approved baseline |
| --- | --- |
| D01 API ownership | Workspace BFF/API client-facing; asset-service authoritative for asset state, upload and metadata |
| D02 File validation | PDF-only, 5 MiB maximum, content signature/size verification |
| D03 Broker/storage | Kafka, MinIO, PostgreSQL for local Docker-based PoC |
| D04 Processing status | Asset-service canonical status; BFF reads; UI polls |
| D05 Reliability | Transactional outbox, idempotent events, bounded retries and failure tracking |
| D06 Security | Synthetic tenant identities, trusted context, resource-level default-deny enforcement |

## Approval scope
The repository owner explicitly approved **the six architecture proposals** in the OpenSpec design at commit `87079ecc3de93495a27776ddcd530d350dcbf205`. That approval authorizes refinement of the machine-readable API/event specifications **for review**. It does not, by itself, prove valid OpenAPI/AsyncAPI contracts, test coverage, or readiness for feature implementation.

**Feature implementation gate: BLOCKED** until machine-valid OpenAPI/AsyncAPI contracts have been authored, reviewed and approved against these six decisions, and the OpenSpec artifacts are finalized. Review any material divergence from the approved baseline with the owner.

## Audit
- Approved by: Repository owner (as expressed in conversation)
- Recorded on: 2026-10-30
- Decision scope: D01–D06
- Approved revision: `87079ecc3de93495a27776ddcd530d350dcbf205`
- Next action: Contract-first specification review
