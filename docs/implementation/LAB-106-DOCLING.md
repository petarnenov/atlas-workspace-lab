# LAB-106 — Docling parsed copies

Synthetic local demo; not a production document-processing service.
Approved specification: `openspec/changes/lab-106-docling-parser`, revision 1
(`cd6ff51`); owner approval recorded alongside the change. Python is restricted
to this independently deployed parser and its tests/build. Other services remain Java.

## Processing and inspection

The worker validates the event/reference and PDF in its existing Java sandbox,
then sends the validated bytes to the private Docling service. The worker checks
source SHA-256 and response/version/size bounds and atomically commits Markdown,
Docling JSON and the completed checkpoint under its valid lease/fence. Copies
live in `worker_checkpoint.parsed_document` on the existing PostgreSQL PVC.
Only the worker owns these writes. Original PDFs remain in object storage.

```sh
make helm-setup ENV=dev
make helm-build ENV=dev
make helm-up ENV=dev
make helm-forward ENV=dev
```

Use `make helm-token ENV=dev`, upload a synthetic text PDF in the UI, and wait for
completion. Use the returned asset UUID (also visible in the upload HTTP response):

```sh
make parsed-copy ENV=dev ASSET_ID=<asset-uuid>
make parsed-copy ENV=dev ASSET_ID=<asset-uuid> FORMAT=json
```

`FORMAT=markdown` and `TENANT=a` are defaults. `TENANT=b` selects the other
synthetic identity. Reads go through the BFF's existing asset authorization, then
its dedicated worker-read audience, with tenant-scoped artifact lookup. The
command opens and cleans its own temporary loopback API forwarding connection;
no existing UI forwarding is required or stopped. Failed reads exit nonzero,
without displaying credentials. Old completed assets without a saved copy return
404; reading never silently uploads or reparses them. Prod demo uses `ENV=prod`.

## Independent deployment and three replicas

```sh
make helm-build ENV=dev SERVICE=docling-parser
make helm-deploy ENV=dev SERVICE=docling-parser
make helm-status ENV=dev SERVICE=docling-parser
make helm-logs ENV=dev
```

The parser has a separate image/release and **three replicas in each profile**.
The worker remains one replica with serial conversion requests: this does not
promise threefold throughput. A ClusterIP Service routes to ready parser pods.
Each parser reserves 500m CPU/1024 MiB memory and is limited to 2 CPUs/2048 MiB,
with 256 MiB scratch. Docker needs 14 GiB RAM for concurrent profiles; 8 CPUs are
recommended. Four CPU CI runners exercise the profiles' parser pools and applications
sequentially while keeping both environments' database/broker/storage
network-boundary targets alive. Tests explicitly
start all three parser replicas in each profile; they do not lower replica counts.

Parser startup verifies the packaged model file hashes and initializes the
converter before readiness. No runtime model download or internet egress is
allowed. Read-only, non-root containers have no storage/DB credentials, shell,
package manager or service account token. A dedicated domain-separated ephemeral
parser credential is mounted in Kubernetes Secret `parser-access` only in the
worker and parser. Existing DB credentials and immutable Secrets are preserved.
Local Compose uses an ignored credential env file and one isolated parser instance.
The Node application harness forwards loopback HTTP over a fixed Docker exec/stdin
bridge; the parser stays on an internal-only network without a published host port;
native Kubernetes and both Helm profiles use three replicas.

## Bounds and failure semantics

PDFs: <=5 MiB, <=20 pages; combined conversion response <=10 MiB. Text PDFs only:
OCR, enrichment and external inference are disabled. Empty extraction, unsupported
or encrypted documents fail. One conversion at a time per parser pod; busy returns
429. Each conversion runs in a disposable subprocess, killed at 40 seconds; worker
HTTP deadline is 45 seconds. Private scratch is removed on success/failure/timeout.

Lease renewal runs every 15 seconds against the worker's existing 60-second lease;
lost ownership cancels processing and cannot save an artifact. Transient parser
failures use the existing maximum three attempts/backoff; exhausted attempts fail
with `RETRY_EXHAUSTED`. Permanent conversion rejection maps to `PROCESSING_ERROR`.
No completed event is emitted before the artifact transaction commits. Repeated
conversion may occur after a crash; exactly-once conversion is not claimed.

The worker logs `parser_started`, `parser_saved` and `parser_retry` using validated
opaque event/asset/correlation IDs. Document text, raw exceptions, paths, tenant IDs
and credentials are excluded. Parsed output is untrusted data, never instructions.
Synthetic artifacts persist with demo assets until environment data is explicitly
reset. No production retention/deletion capability is claimed.

## Versions, checks and rollback

Docling 2.145.0 and CPU Torch dependencies are locked by artifact hashes in
`services/docling-parser/uv.lock`. Model revisions are recorded in `models.json`:
Heron `8f39ad3c…` and TableFormer `fc0f2d45…`; exact snapshots and a file SHA-256
manifest are baked into the image. The minimal runtime uses pinned Python 3.12
and distroless Debian 13 images. Copied runtime libraries retain their Debian
package inventory for vulnerability scans. No vulnerability exclusions are added.

```sh
make parser-test
make check
make test-integration
make test-e2e
make helm-test
make helm-security
```

`make up` prepares the local parser credential and starts the Compose converter
for JVM harness/E2E parity. Python runs inside the image; no host Python setup is
required. Parser tests run with `--network=none`, enforce >=75% source coverage,
and verify hand-authored expected text/reading order/table cells independently
of converter output. Java and Make tests cover authorization, response validation,
atomicity, stale leases, retry behavior and inspection failures.

Deploy parser before worker/BFF. Roll back worker/BFF before parser using existing
Helm rollback commands; retain the additive artifact table and its data. No
automatic historical backfill. Review the Python exception before merge and on
any dependency/model/runtime version change. Replacing/removing Docling requires
an approved replacement or removal of this feature. Human review and green CI
remain required before merge.
