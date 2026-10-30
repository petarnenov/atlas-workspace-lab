# LAB-101 implementation approval

Owner decision in this conversation, 2026-10-30: **„одобрявам“**, in direct
response to approval of revision `11f8f6a18a9e418de2fb3e80690ccbdd8a2324e8`.

Approved: all execution decisions in `docs/architecture/lab-101-execution-decisions.md`
and proposal/design/spec/tasks in `openspec/changes/lab-101-worker-checkpoint/`
at that exact revision. This includes a separate worker-owned PostgreSQL
checkpoint database/role on the local instance, fencing, durable outcomes,
retention and recovery tests. Historical PROPOSED/review-question labels are
superseded by this record; the approved artifact bytes are preserved.

Original contract approval and exact PR revision are linked in the execution
decisions. No wire-contract changes, merge, archive or production deployment
are authorized. Implementation remains subject to tests, CI and human review.

## Storage lifecycle decisions

Owner approved proposed temporary local MinIO exception revision `d452014` with
„да“. Before any archived source build occurred, the owner requested replacement
and explicitly approved: „одобрявам подмяна на минио с с3 подобни решение“.
The new instruction authorizes the S3-compatible replacement scope recorded in
`openspec/changes/lab-101-s3-storage/` and supersedes use of the MinIO exception.
No unsupported MinIO server/client has been run.
