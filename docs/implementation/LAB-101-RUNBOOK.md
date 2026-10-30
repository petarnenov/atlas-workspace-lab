# LAB-101 local operations

This runbook applies only to the synthetic local demonstration. Every exposed
port binds to loopback; Docker's private network carries local plaintext Kafka
and object traffic. Host access and Compose administrative credentials remain a
trusted operator boundary. There is no production OIDC, mTLS, managed secret
store, tenant-specific object credential, multi-node availability, or DR guarantee.
Do not expose these services publicly or reuse credentials outside this demo.

## Components and artifacts

- `services/asset-service`: port 8081; owns `assets` database as `asset_owner`.
- `services/workspace-api`: port 8080; BFF verifies fixture tokens and issues
  separate one-minute service tokens. It has no database ownership.
- `workers/processing-worker`: background JVM; owns `worker_checkpoint` database
  as `worker_owner`; has no permission to connect to `assets`.
- `libraries/demo-support`: public wire, identity, HTTP failure and S3 helpers;
  contains no domain state. Private service imports are statically prohibited.
- `apps/portal-ui`: port 5173, proxies `/api` to the BFF in local Vite mode.
- Java artifacts: each component's `build/libs/*-0.1.0-SNAPSHOT.jar`.
  The worker also requires its `*-parser.jar` at the configured root-relative
  path, overridable with `LAB_PARSER_JAR`.

`make apps` starts the three JVM artifacts and stops all of
them if one unexpectedly exits. Ignored `.local/logs/` holds service logs. The
local test harness supports SIGUSR2 to kill/restart the worker for failure
injection; this is not a remotely exposed application operation.

## Durable data and bounded recovery

Compose named volumes retain PostgreSQL data, Kafka logs at the explicit
`/var/lib/kafka/data` path and RustFS objects/IAM at `/data`. Recreating containers
preserves these volumes; `make stop` preserves both containers and
volumes. Never use `down --volumes` unless intentionally deleting all demo data.
Do not regenerate `.env` against existing databases or object-store identities.

Asset uploads validate before reservation/write. An asset-owned durable upload
intent spans the object write and final metadata/outbox transaction. The exact
idempotency scope is serialized by a PostgreSQL advisory lock. Keys last 24 hours;
same-key retries return the original PENDING receipt even after completion.
A failed metadata commit triggers deletion unless commit acknowledgement is
ambiguous; retained intents allow recovery. Every minute, cleanup checks
uncommitted intents older than ten minutes under the same lock and deletes an
unreferenced object. It never deletes committed metadata or processing evidence.

The outbox commits PROCESSING before publication. Publication retries at most
three times with bounded calls and exponential backoff. Exhausted rows remain
inspectable in `upload_outbox`, with `last_error`, attempts and next time. Assets
still PROCESSING after fifteen minutes become FAILED/RETRY_EXHAUSTED.
Late/conflicting outcomes cannot alter a terminal status.

The worker persists validated input before Kafka acknowledgement, takes a
60-second fenced lease, and retains the exact immutable outcome before sending.
It retries transient object operations at most three times. The PDF subprocess
has a 64 MiB heap, 64 MiB metaspace and ten-second wall-clock deadline; it rejects
malformed, encrypted, empty or over-100-page PDFs without rendering or executing
content. This process limit is not an OS/container security sandbox.

Outcome publication has three attempts and retains exhausted checkpoints.
Kafka listener database/handler failures stop that listener without committing
the failed input. Fix the dependency and restart that component to replay its
unacknowledged offset. A hard worker kill may take about 45 seconds for Kafka's
consumer-group session to expire before the replacement receives partitions.
The tested recovery allowance is 65 seconds, not an availability SLO.

Keep checkpoints at least as long as the configured seven-day Kafka replay
retention. There is no automatic checkpoint/evidence purge. All local data is
synthetic and remains until an explicit operator teardown. Queue topics have a
seven-day retention; processing is deliberately single-node and bounded, with
no scalability/fairness claim.

## Investigate a failure

Use ignored service logs and sanitized database fields. Do not paste tokens,
PDF contents or `.env` into issues/PRs. Administrative database inspection is an
operator action; runtime services never use the administrative role.

- `asset_finding` records invalid, unknown, conflicting and scope-mismatched
  outcomes. `worker_finding` records invalid or conflicting inputs.
- Inspect `upload_intent` for uncommitted object compensation and `upload_outbox`
  for publication attempts. Fix storage/broker/database health before retrying.
- Inspect worker `checkpoint` input, lease/fence, attempts, outcome, sent and
  publication attempts. A lease allows recovery after a process disappears.
- Replaying exhausted publications requires an operator decision. Reset only
  the selected unsent row's publication attempt count/time, preserving event ID,
  payload, tenant and correlation. Never replay by inventing a new event ID or
  overwrite a terminal asset. The normal scanners then resume publication.
- A failed local dependency returns a sanitized 503. The UI offers retry while
  preserving the selected upload's Idempotency-Key; a different file gets a new
  key. Polling has a finite deadline and tolerates only three consecutive errors.

## Dependency provenance and security checks

Container base images are pinned by digest in `compose.yaml` or `infra/**/Dockerfile`.
RustFS 1.0.4 is from its official stable release; its native rc bootstrap CLI
0.1.36 is downloaded from the official release and checked against a pinned
SHA-256 for each supported architecture. No archived MinIO source build ran.

PostgreSQL 17.11 Alpine replaces the old Go-based `gosu` helper with Alpine
`su-exec` and updates the entrypoint accordingly. Kafka 4.4.0 applies Alpine
security updates and replaces only the LZ4/snappy JARs with checksum-verified
Maven Central patch releases (1.11.4 / 1.1.10.9). These derived images are scanned
and exercised by the same integration/E2E suite. Alpine security updates are
resolved at image build time; record the resulting image IDs when reproducing
an audit. Rebuild/rescan when security advisories change.

Gradle and pnpm lockfiles control application dependencies. Dependency overrides
fix scanner findings in HTTP, compression and development-tool transitive
packages. Trivy 0.76.1 is checksum-verified by `install-trivy.mjs`; its security
databases update during scans. Reports stay in ignored `.local/security/`.
The repository scan includes dev dependencies and secrets, excluding generated
credentials, ignored tooling/caches and dependency directories. Container scans
cover discoverable OS/language packages; they do not prove absence of defects
inside the RustFS Rust binary or substitute for human review.

## Rollback

This branch is a local PoC feature. Before merge, stop applications/dependencies
and return to the previous reviewed source revision; no running production
system or shared deployment is changed. Keep volumes for inspection. To restart
this implementation, use matching credentials, schema and artifacts. There is
no promise that an older implementation understands a newer database schema.

Removing all synthetic data is a separate, explicitly destructive operator
choice. Never delete volumes or credentials as an automatic rollback step.
Do not merge or archive OpenSpec changes until the owner reviews the PR and CI.

## Make workflow

Use `make doctor`, `make setup`, then `make dev` from the repository root.
Use `make status` to inspect dependencies and `make stop` to stop them without
deleting volumes. See README for all build, test and security commands.
If setup reports partial credentials, restore the matching local .env and all
four signing keys; never regenerate credentials against existing volumes.
