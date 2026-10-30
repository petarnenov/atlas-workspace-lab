# S3 replacement design

D03 is revised only from MinIO server to RustFS 1.0.4. The asset service remains
sole owner of document writes/deletes; worker only reads. No changes to versioned
OpenAPI or AsyncAPI documents. The single local instance is disposable and makes
no availability/durability/production claims.

Pin official container by digest after pulling. Expose S3 only on 127.0.0.1:9000;
disable console, bind internal bootstrap access to the Compose network. Generate
ephemeral bootstrap root and two service credentials into ignored local files.
The bootstrap root is available only to storage and one-shot setup, never to
applications or UI. Use RustFS-native rc commands; MinIO Admin API compatibility
is not assumed. Pin and checksum the CLI release; do not use archived mc.

Bucket: synthetic-assets. Asset policy allows only s3:GetObject, s3:PutObject,
s3:DeleteObject on its objects. Worker policy allows only s3:GetObject. Neither
policy permits bucket listing, bucket administration, or another bucket. SDK
uses explicit region us-east-1 and path-style addressing, bounded connect/API
call timeouts and no hidden unbounded retry loop. Processed bytes remain limited
to 5 MiB. Test authorization against real storage, including anonymous requests.

Bootstrap is repeat-safe and rejects unexpected failures. Persistence uses a
separate RustFS volume; never mount or interpret an old MinIO data directory.
No migration of real data exists. Rollback stops applications/storage, retains
volumes and returns to the previous code revision; archived MinIO is not started
automatically. Remove disposable volumes only by explicit operator action.

Before acceptance: verify image provenance/security scan, object SDK compatibility,
asset create/read/delete, worker read-only, anonymous/other-bucket denial,
compensation, restart recovery and full upload-to-terminal E2E. Existing overall
75% coverage and independent artifact gates remain mandatory.
