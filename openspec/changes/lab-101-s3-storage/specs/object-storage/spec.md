# Object storage replacement

## MODIFIED Requirements

### Requirement: Supported local S3-compatible storage
The system SHALL use a pinned stable RustFS local container and official AWS
Java S3 SDK without changing the existing HTTP/event contracts or data ownership.

#### Scenario: Asset object lifecycle
- WHEN asset-service writes an accepted synthetic PDF under a generated opaque key
- THEN the same bytes can be read and an uncommitted object can be compensated by deletion

#### Scenario: Worker permissions
- WHEN the worker identity requests an existing authorized object
- THEN GetObject succeeds
- AND attempts to put/delete objects, list buckets or change policies are denied

#### Scenario: Anonymous and other-bucket access
- WHEN requests lack credentials or use a service credential for another bucket
- THEN storage denies them without returning document bytes

#### Scenario: Storage failure
- WHEN object storage is unavailable or rejects a write
- THEN upload returns a sanitized 503, no processing event is published, and intent recovery remains possible

#### Scenario: Repeat bootstrap and restart
- WHEN the local stack is initialized twice or storage restarts
- THEN configured identities/policies and existing synthetic objects retain their semantics
