# Document parsing — revision 1

## ADDED requirements

### Requirement: Validate before conversion
The worker SHALL invoke Docling only after existing event/object/sandbox checks.
Scenario: invalid event, reference or PDF produces existing failure/finding and no
parser call. Scenario: valid synthetic text PDF yields source-grounded Markdown
and JSON without modifying the original PDF.

### Requirement: Durable tenant-scoped copies
The worker SHALL atomically persist its artifact and completed outcome under a
valid checkpoint fence. Scenario: restart after commit retains retrievable copy.
Scenario: duplicate delivery does not duplicate committed artifacts. Scenario:
lease expiry or crash before commit exposes no partial or successful copy.

### Requirement: Authenticated inspection through Make
make parsed-copy SHALL accept environment, asset UUID and optional format, use
the authorized API, print the chosen saved format and fail nonzero on errors.
Scenario: authorized owner gets exact stored Markdown/JSON after completion.
Scenario: foreign tenant, invalid token, unknown asset or missing copy yields no
document data. Scenario: invalid args do not reach the endpoint or execute shell
input. Tokens never appear in logs/output.

### Requirement: Independent parser with three replicas
Docling SHALL have its own image and Helm release, with three replicas in dev and
prod demo. Scenario: independently redeploying parser leaves worker/API/UI release
revisions unchanged. Scenario: readiness excludes an uninitialized parser pod.
Scenario: insufficient cluster resources are reported rather than hidden.

### Requirement: Bounded conversion and safe failures
The parser SHALL enforce authentication, input/page/output/time/concurrency
bounds and no runtime external fetches. Scenario: timeout or transient outage
retries within three attempts then fails durably. Scenario: malformed/encrypted/
oversized PDF fails terminally. Scenario: forged response hash, invalid JSON or
oversized output is rejected without storing a completed artifact. Scenario:
subprocess/temp cleanup occurs on every terminal path and lost lease. Scenario:
unauthorized workloads cannot access parser or worker data; no SSRF URL input.

### Requirement: Demonstrated quality and operational checks
CI SHALL run meaningful happy/failure/security tests with >=75% measured source
coverage for affected Java, Python and orchestration features, real synthetic PDF
E2E upload -> parse -> saved-copy retrieval, dependency/image/secret scans and
contract checks. Model-backed conversion SHALL pass independent synthetic text,
reading-order and table regression fixtures before promotion. Demo limitations,
locked versions and resource costs SHALL be documented.
