# Architecture decision register

| ADR | Revision | Status | Scope |
| --- | --- | --- | --- |
| [0001](0001-hexagonal-microkernel.md) | 1 | PROPOSED | Application-owned ports, dependency direction, trusted extensions |
| [0002](0002-derived-artifacts.md) | 1 | PROPOSED | Replaceable artifact persistence, ownership and consistency |

Story: LAB-107. Exact approval, reviewer, date and approved revision/commit must
be recorded before changing status to ACCEPTED. The current request authorizes
preparing this proposal, not recording approval of unseen text. Prior LAB-101
decisions remain in `../lab-101-execution-decisions.md` and its linked register.

Acceptance does not certify historical code. LAB-106 still has provider leakage,
concrete dependencies and coupled checkpoint/document storage. Its functional,
security and deployment evidence remains valid within its tested scope.

Future decisions must include context, alternatives, dependency/data ownership,
consequences, acceptance tests, owner, approval evidence and rollback/migration.
Supersede decisions explicitly; do not silently rewrite approved history.
