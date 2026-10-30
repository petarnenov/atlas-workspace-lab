# Worker checkpoint — proposed requirements

## ADDED Requirements

### Requirement: Independently owned persistence
The worker SHALL exclusively own a checkpoint database and SHALL have no access
to asset-service tables. Asset-service SHALL have no access to worker checkpoints.

#### Scenario: Cross-service database access denied
- WHEN either component attempts to connect to the other's database with its own role
- THEN PostgreSQL denies access and no data can be read or changed

### Requirement: Durable input and outcome
The worker SHALL durably record validated input, retries, leases and exact
outcome before acknowledging input or relying on a successful publication.

#### Scenario: Restart after input acknowledgement
- WHEN the worker restarts after acknowledging an input but before parsing it
- THEN its scanner resumes from the persisted checkpoint

#### Scenario: Restart after publish acknowledgement is lost
- WHEN an outcome was published and the worker restarts before recording delivery
- THEN it republishes only the same eventId and payload
- AND asset-service applies at most one terminal transition

#### Scenario: Duplicate or conflicting input
- WHEN a previously seen event is delivered again
- THEN matching input reuses the existing checkpoint
- AND conflicting input is quarantined without a second processing outcome

### Requirement: Bounded execution and recovery
The worker SHALL enforce a 10-second parser subprocess deadline, fixed heap,
three processing attempts and fenced 60-second leases.

#### Scenario: Permanent document failure
- WHEN parsing finds malformed or encrypted PDF content
- THEN no retry occurs and an INVALID_DOCUMENT failure outcome is persisted

#### Scenario: Transient failures exhaust attempts
- WHEN object retrieval fails on all three attempts
- THEN RETRY_EXHAUSTED is persisted as the terminal failure outcome

#### Scenario: Expired lease and stale writer
- WHEN a crashed worker's lease expires and another worker acquires it
- THEN processing can resume
- AND a write carrying the old fencing token is rejected

#### Scenario: Outcome publication exhausted
- WHEN all three publication attempts fail
- THEN the exact outcome remains in inspectable durable exhausted state
- AND operator replay sends the same outcome identity without rerunning the parser

### Requirement: Safe retention
The system SHALL retain terminal checkpoints while local demo data exists and
SHALL not automatically delete deduplication state independently of broker data.

#### Scenario: Historical duplicate replay
- WHEN a terminal asset's original upload event is replayed after broker retention
- THEN retained checkpoint identity prevents a new processing outcome

#### Scenario: Terminal reconciliation precedes late outcome
- WHEN asset-service marks a stuck asset failed before the worker result arrives
- THEN the late result cannot replace its terminal state
