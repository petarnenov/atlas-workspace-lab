# Helm environments — revision 1

1. Dev and prod are explicitly synthetic local demos. Selecting an unknown
   environment, unexpected cluster identity or another manager's resources fails
   before mutation. No default/current cluster fallback or ownership takeover.
2. Explicit helm-tools installs checksum-verified pinned Helm; doctor/lint/template
   are read-only. All user-facing lifecycle operations are available through Make.
3. Dev and prod run concurrently in atlas-dev/atlas-prod with separate namespaces,
   credentials, keys, PVCs, releases, operation state and loopback ports. Setup/up
   repetition reuses matching state and fails on partial/mismatched credentials.
4. Each environment has four independent application releases and one platform
   release. helm-deploy of one valid SERVICE changes only that app release and
   its owned resources; other app/platform revisions and the other environment's
   state stay unchanged. Unknown services or missing immutable images fail early.
5. Dev has one replica per app. Prod demo has two UI/API replicas and one asset
   service/worker plus single-instance dependencies. Requests/limits and these
   counts are checked. Both profiles complete real synthetic uploads via static
   UI, API, domain service and worker; prod replica routing preserves authorization.
6. Platform startup verifies dependency readiness, idempotent initialization and
   positive/negative network proofs before app rollout. Failure returns nonzero
   within finite deadlines; retry preserves identities/data and does not bypass
   initialization or silently lower security/resource requirements.
7. Charts reference existing per-consumer Secrets without storing secret contents
   in values/manifests/release history. Restricted pods, worker-only parser,
   database/object least privilege and disabled API-token automount remain intact.
   Unauthenticated/cross-tenant requests and disallowed intra/cross-environment
   database/broker/object traffic are tested and denied.
8. Worker restart, duplicate events and stateful pod recreation retain checkpoints,
   receipts, objects and stable Kafka client service addressing. New uploads after
   recovery complete within the approved existing functional test deadlines.
9. Stop/up of one environment retains PVC identity/data and restores its reviewed
   replica counts without affecting the other. Ctrl+C stops only owned forwarding.
   No normal Make operation deletes namespaces, credentials, stores or clusters.
10. Explicit app rollback to an existing compatible Helm revision changes only that
    release, preserves persisted data, and passes its functional check. Unknown
    revisions and platform/schema rollback requests are rejected. Interrupted or
    failed upgrades remain inspectable and retryable without force/takeover.
11. CI validates both values profiles/schema/security configuration and all charts,
    measures >=75% source coverage for new helper logic, installs both profiles in
    kind and proves scenarios 3–10. Existing contract/native/Compose gates remain
    green. Security scans cover all deployed images, charts and rendered resources.
12. Runbook documents every Make command, release/namespace ownership, prerequisites,
    aggregate resource measurement, separate data/credentials/ports, upgrade and
    rollback recovery. Prod demo retains synthetic fixture authentication and
    single-instance dependency limitations; it is never called production-ready.
