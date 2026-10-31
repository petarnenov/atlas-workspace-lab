# Runtime boundaries — revision 1

## ADDED Requirements

### Requirement: inward dependencies and explicit binding
All existing backend capabilities SHALL follow ADR-0001/0002, with no existing
finding approved as debt. Inbound adapters SHALL only translate/authenticate and
invoke use cases. Core SHALL own neutral ports/types; bootstrap SHALL bind them.

#### Scenario: complete audit
Given all backend sources and active contracts, when strict architecture checks
and semantic review run, then there are zero findings and no baseline suppression,
reclassification of mixed classes, cross-service imports or provider DTO leakage.

#### Scenario: replace implementations
Given unchanged processing/read/upload use cases, when bindings select a deterministic
parser instead of Docling and a contract-tested alternative store instead of RustFS,
then required neutral behavior, tenant isolation and failure semantics are unchanged.
Real RustFS and real Docling SHALL also pass their applicable contract/integration
tests. Doubles SHALL NOT be presented as independently deployed production providers.

#### Scenario: substitute worker
Given a replacement worker consuming uploaded v1 and producing processed v2, when
it runs the same black-box suite with the original BFF/asset/parser images, then
identity, idempotency, retries, fenced completion, artifact binding and read behavior
are preserved without edits to those components. A test harness demonstrates the
contract boundary; another production worker engine is not required.

### Requirement: durable asset-owned artifacts
Derived content SHALL use the asset-owned ArtifactStore capability and verified
immutable references, with the staging/finalization protocol in design.md.

#### Scenario: validate before parsing
Invalid event/reference/source/PDF SHALL fail before any parser call or artifact
stage. Existing size/page/OCR/deadline limits and sanitized failures SHALL remain.

#### Scenario: crash and stale owner
Exercise crash after object write, after manifest commit, after fenced worker
commit and before/after broker acknowledgement. Retries SHALL converge without
duplicate terminal effects; stale owners SHALL never publish/delete winner content.
Stage-only content SHALL never be readable as completed.

#### Scenario: authorization and integrity
Wrong tenant, workload audience, source digest, correlation, conflicting duplicate,
missing/corrupt object and unavailable storage SHALL fail closed. No document text,
credentials, private paths or raw provider exceptions SHALL be logged.

### Requirement: reversible migration and compatibility
Migration SHALL preserve original v1 copies and bind verified manifests to the
authorized asset. V2 SHALL expose portable Markdown/neutral JSON, not native schemas.

#### Scenario: repeat, interrupt and roll back migration
Export/import interrupted between any two steps SHALL resume idempotently; verified
per-tenant counts/checksums SHALL match. Legacy absent copies remain absent. New
writes SHALL survive the demonstrated rollback path before cutover is enabled.

### Requirement: dev-first delivery
Development SHALL follow ADR-0003: worktrees/task branches, dev-only execution,
local checks before reviewed dev integration, hosted CI only for dev-to-main PRs.

#### Scenario: workflow event matrix
Task/dev pushes and PRs to dev SHALL not trigger hosted checks. Only same-repository
dev-to-main promotion SHALL execute required build/test jobs before human merge.
Other main PR sources SHALL fail the source gate, including fork branches named dev.
All applicable local checks SHALL remain mandatory and reproducible through Make.
