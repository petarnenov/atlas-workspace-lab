# LAB-101 — proposed temporary MinIO lifecycle exception

Status: PROPOSED; NOT APPROVED, do not execute the source build yet.
Owner/reviewer: repository owner.
Issue: https://github.com/petarnenov/atlas-workspace-lab/issues/2
Discovered: 2026-10-30. Proposed expiry/review date: 2026-11-06.
Affected principles: P20 (supported versions), P10 (dependency provenance and
supply chain), P05 (operational purpose); P06–P09 remain binding.

## Evidence

- https://github.com/minio/minio is archived (2026-04-25) and states that it is no
  longer maintained; verified through both the repository page and GitHub API.
- Upstream master resolves to `7aac2a2c5b7c882e68c1ce017d8256be2feea27f`,
  last source commit timestamp 2026-02-12T20:18:48Z, observed 2026-10-30.
- https://github.com/minio/mc is also archived (2026-07-14).
- Pulling `minio/minio:RELEASE.2025-09-07T16-13-09Z` fails with access denied;
  pulling the same tag from quay.io fails with unauthorized.
- Official download endpoints for server and mc return HTTP 410 Gone.
- PostgreSQL and Kafka image pulls work independently; this is not a general
  Docker failure. These observations do not establish that every possible
  historical MinIO mirror is unavailable or safe.

## Conflict and rationale

D03 explicitly selects MinIO. Silently switching storage products changes that
approved choice; using archived community software conflicts with the supported
version guardrail. Building from source resolves distribution availability, but
DOES NOT restore upstream support. The previous worker-checkpoint approval did
not approve this exception. AGENTS.md requires stopping feature work, documenting
rationale/safeguards/owner/rollback and owner approval before implementing a
principle exception.

## Proposed exception for approval

Permit the archived community MinIO server solely as disposable local LAB-101
infrastructure until 2026-11-06. Build unmodified official source at the exact
commit above into a locally tagged container. Retain upstream license/notice,
record archive SHA-256 and source revision, use a pinned supported Go builder
only to compile this external dependency, and scan source dependencies and final
image before execution. No Go application code or vendored upstream source is
added to this repository. No third-party mirror, floating latest tag, proprietary
edition/account, license acceptance or new external storage is authorized.

The build recipe will download the exact commit archive from the official
GitHub repository, verify its recorded SHA-256, run the upstream build in a
multi-stage container, and copy only the resulting unmodified binary and license
into a non-root runtime image. The source checksum and container digest become
verification evidence before starting it. Do not automatically run a vulnerable
image if the scan finds unmitigated high/critical issues; return concrete findings
for review. Source-only availability must never be reported as maintained status.

Use the official mc source in a separate, pinned, one-shot bootstrap image only
if its dependency/image scans pass under the same policy. Record its exact commit
and checksum before execution; no archived mc binary is downloaded from mirrors.
Alternatively use a maintained Java administration client only if it can enforce
the already-approved separate asset/worker policies without expanding trust.

## Mandatory safeguards

- Bind S3 to loopback only, no public deployment or console port.
- Set generated ephemeral credentials; keep keys and .env ignored and local.
- Only synthetic PDFs; no confidential/user/customer data.
- Asset identity has only required bucket-object read/write/delete privileges;
  worker identity has GetObject only. Never use the root identity in services.
- Pin source and build/runtime images; verify checksums, record provenance and
  vulnerability scan results. No automatic scan bypass or unsupported claims.
- Keep HTTP and Kafka wire contracts unchanged. Complete upload, failed upload,
  cross-tenant, compensation, duplicate, restart and timeout tests before review.
- Stop using this exception on expiry; owner decides renewal or supported storage
  replacement through a reviewed design change.

## Rollback

Stop application processes and the local MinIO container; preserve ignored local
volumes if investigating failures. Remove the locally built images explicitly.
Do not automatically delete volumes, regenerate credentials for existing volumes,
reset Kafka offsets or erase deduplication state. Resume feature/integration work
only after this exception or an alternative storage specification is approved.
A supported replacement must retain tenant scoping, immutable object references,
restricted credentials, intent compensation and wire compatibility tests.

## Decision requested

Approve this temporary, local-only source-build exception with the safeguards
above, or request a separately reviewed supported storage replacement. No exception
has been applied by preparing this document. The Compose file now requires explicit
MinIO image selection instead of defaulting to unavailable historical images.
