# LAB-105 — Worker console logging

Synthetic story LAB-105. The owner approved OpenSpec revision 1, commit `7fae3df`,
with “ok odobrqwam” before implementation; see the change's approval.md.

WorkerEvents uses existing Spring Boot/SLF4J console logging, with no new settings
or dependencies. INFO messages: input_received, processing_started, outcome_saved,
outcome_published. WARN messages: outcome_not_saved, retry_scheduled,
publication_retry_scheduled, publication_exhausted. Empty scheduler polls are silent.

Receipt is not durable acceptance. A saved outcome is not downstream delivery.
Saved outcomes are logged only after a successful fenced write; publication is
logged after Kafka acknowledgement and the sent-state update. Existing processing,
retry, fencing, validation and contract behavior remains unchanged.

Logs use opaque event/asset/correlation UUIDs, attempt numbers and fixed status or
error codes. They omit raw payloads, object keys, URLs, document text, tenant IDs,
credentials, tokens and exception details. Unexpected internal parser error text
is mapped to a fixed logging code without changing the persisted outcome.

After merge, deploy just the dev worker with existing Make commands:

```sh
make helm-build ENV=dev
make helm-deploy ENV=dev SERVICE=processing-worker
make helm-logs ENV=dev
```

The log command includes other workloads with pod/container prefixes. Filter its
output with `rg processing-worker` if needed. Existing Spring logging-level
configuration can suppress INFO output. Prod remains a synthetic demo profile.

## Verification

- Worker unit/integration tests with real PostgreSQL passed; measured worker module
  coverage: 93.98% lines and 83.33% branches. Tests capture the logger and cover
  successful processing/publication, retry/exhaustion, stale fences, publication
  races/state-write failure, invalid envelopes and sensitive-data exclusion.
- Worker assemble passed; scaffold, architecture and contract invariants passed.
- Repository and Compose image scans: zero HIGH/CRITICAL findings, zero secrets.
- Real synthetic UI upload reached COMPLETED through Kafka and the PDF worker;
  actual process console output contained receipt/start/saved/published messages.
  The local test used an ignored config on UI port 5183 to preserve the existing
  Kubernetes forwarding on 5173. Full E2E/CI results are recorded in the PR.
- Versioned contracts, dependencies, retry limits and security boundaries unchanged.
  P02/P03/P05/P06–P10/P15/P16/P18–P20 apply as recorded in the approved proposal.

CI and human PR review remain required before merge or archival.
