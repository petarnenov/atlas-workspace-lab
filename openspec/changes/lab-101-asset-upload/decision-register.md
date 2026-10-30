# LAB-101 Architecture Decision Review

**Status:** ALL PROPOSED — human approval pending.
**Issue:** https://github.com/petarnenov/atlas-workspace-lab/issues/2

| Decision | Proposal | Review status |
| --- | --- | --- |
| D01 API ownership | Workspace BFF + asset-service authoritative ownership | Pending |
| D02 File validation | PDF-only, 5 MiB, signature/size checks | Pending |
| D03 Broker/storage | Kafka + MinIO + PostgreSQL via Docker Compose | Pending |
| D04 Status | Asset-service-owned state machine; BFF reads; UI polls | Pending |
| D05 Reliability | Outbox + idempotent events + 3 bounded retries | Pending |
| D06 Security | Synthetic identity fixture, trusted tenant context, service-level denial | Pending |

## Approval record template
- Reviewed OpenSpec commit SHA:
- Reviewer:
- Approval date:
- Accepted decisions:
- Changes requested:
- Security/contract conditions:
- Evidence link:

**No implementation authorization exists until this record identifies an approved commit and exact decisions.**
