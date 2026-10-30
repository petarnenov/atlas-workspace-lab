# Design — revision 1

Use a class-scoped SLF4J Logger in WorkerEvents and parameterized messages.
Log a constant input_received message when Kafka invokes receive; this indicates
receipt only, not validation or durable acceptance. Do not parse or log raw input
for logging purposes. Checkpoints retains validation and deduplication ownership.

After a lease is claimed and its event parsed through existing validation, log
processing_started with eventId, assetId, correlationId and attempt. Log a
processing result only after finish returns: outcome_saved for a successful fenced
write, or outcome_not_saved for a rejected/stale fence. Describe persisted outcome
rather than claiming downstream delivery. Use existing outcome status/error codes.

Log retry_scheduled after the retry update returns, and retry exhaustion through
the same fenced outcome path. No exception messages, stack traces, object keys,
URLs, payloads, document text, credentials, tokens or tenant IDs enter these new
messages. IDs are validated opaque UUID fields. Failure reasons use fixed codes.

Log outcome_published only after the Kafka acknowledgement and sent-state update
both return successfully. On publication failure, log publication_retry_scheduled
or publication_exhausted according to the persisted publication attempt, after
the existing failure-state update returns. Acknowledgement uncertainty and retry
behavior remain unchanged; do not claim exactly-once delivery.

No logs on empty scheduler polls. Preserve all existing transaction, retry, fence,
acknowledgement and exception behavior. Do not change Checkpoints interfaces or
versioned contracts. INFO covers receipt/start/saved/published, WARN covers retry,
exhaustion and stale fences. Existing Spring Boot console configuration applies.

Verification: capture the class logger in worker unit tests, cover successful
processing/publication, transient retry, exhaustion, stale finish and publication
failure. Inject sensitive strings into failure messages and raw input and verify
they never appear in new logs. Run affected worker tests/coverage (>=75%), build,
architecture/contract checks and security checks; verify real console output in
a synthetic upload path before reporting runtime verification. Publish PR for
review, without automatic merge or deployment to unrelated environments.
