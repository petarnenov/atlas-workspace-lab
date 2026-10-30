# Worker console logging — revision 1

1. Kafka receive emits an INFO input_received message without logging raw input
   or claiming validation/acceptance.
2. A claimed, validated event emits processing_started with its opaque event,
   asset and correlation UUIDs and attempt number; empty polls emit no new logs.
3. Successful fenced outcome writes emit outcome_saved with status/error code;
   rejected writes emit WARN outcome_not_saved and never claim completion.
4. Transient processing failure emits WARN retry_scheduled after the retry update;
   exhaustion logs the persisted RETRY_EXHAUSTED outcome through scenario 3.
5. Successful acknowledged publication and sent-state update emit outcome_published.
   Publication failure emits WARN publication_retry_scheduled or
   publication_exhausted with its attempt and fixed BROKER_UNAVAILABLE reason,
   after the existing failure-state update. Existing retry limits remain unchanged.
6. New logs contain no raw events, document bytes/text, object keys/URLs, tenant
   IDs, credentials, tokens, exception messages or stack traces.
7. Existing processing, fencing, validation, tenancy, persistence, retry and
   versioned API/event contracts remain unchanged. No dependencies are added.
8. Meaningful happy/failure log tests and affected worker coverage >=75% pass;
   checks/security pass and a synthetic runtime path demonstrates console output.
   PR and green CI require human review before merge.
