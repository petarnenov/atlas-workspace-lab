# LAB-101 — supported S3-compatible storage

Status: OWNER-AUTHORIZED replacement scope, 2026-10-30.
Issue: https://github.com/petarnenov/atlas-workspace-lab/issues/2

The owner explicitly instructed: „одобрявам подмяна на минио с с3 подобни решение“
after the archived MinIO dependency was identified and S3-compatible alternatives
were discussed. This authorizes choosing and implementing a supported S3-compatible
replacement within the existing trust and ownership boundaries. No further
MinIO source build is necessary. The previous temporary MinIO exception was
approved in conversation but was never exercised; this change supersedes its use.

Select stable RustFS 1.0.4 (official non-prerelease published 2026-10-25) as one
local object-storage container. Use its maintained rc CLI 0.1.36 for one-shot
bucket/user/policy setup, with verified official release checksums. Replace the
MinIO Java client with the official AWS SDK for Java S3 client.

Preserve PostgreSQL/Kafka, all existing wire contracts, synthetic-only inputs,
service ownership, object intent/compensation, generated opaque keys, and separate
asset read/write/delete and worker GetObject-only identities. No public console,
cloud account, proprietary edition, paid service or production deployment.

Applicable principles: P02/P03/P05–P10/P12/P15–P20.
Sources: https://github.com/rustfs/rustfs/releases/tag/1.0.4,
https://docs.rustfs.com/en/security-compliance/iam,
https://github.com/rustfs/cli/releases/tag/v0.1.36.
