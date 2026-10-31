# Architecture enforcement

Accepted decisions: ADR-0001/0002, revision 1, with the owner's minimal reusable
contract clarification. Runtime remains at the existing LAB-106 implementation.

## Commands

- `make architecture-test`: offline negative fixtures and >=75% measured source/
  branch gates (Node 24). No package install, Python, Docker or cluster required.
- `make architecture-inventory`: read-only JSON diagnostics with source fragments,
  line locations and hashes. It never accepts or updates debt.
- `make architecture-check`: original checks plus the ratchet. Also reached by
  `pnpm check:architecture` and `make check`; scaffold CI runs tests and this gate.
- `make architecture-audit`: strict mode fails on every remaining finding.

Initial inventory: see debt-review.md and the exact debt-baseline.json. Approval is
pending. Therefore the check/CI intentionally fails; do not silently flip approval
or remove the gate to get green CI. Exact owner review must precede enabling the
ratchet. Policy/baseline changes require review; status text is not cryptographic
proof of human approval. Neither approval nor a green ratchet certifies old code.

## Coverage and limits

The checker scans Java/Python in apps/services/workers/libraries, excluding test
and build/dependency directories. Existing files have explicit role assignments;
new files use domain/application/ports/adapters/in/adapters/out/bootstrap paths,
otherwise fail unclassified. Adding a flat source beside legacy files does not
inherit their baseline. Provider contracts are individually declared.

Lexical rules detect known infrastructure namespaces, qualified references,
references to adapter file types, concrete provider classes, SQL operations and
literals in core/inbound code, and provider leakage in core schemas. This is a
conservative lexical guard, not a compiler or semantic dependency resolver.
Reflection, generated code, aliases/custom wrappers, SQL assembled entirely from
variables and intentionally misclassified source still require build/review and
actual shared adapter/substitution tests. Name collisions may require improved
resolution, not blanket suppressions. A folder name or unused interface does not
prove hexagonal design, working bindings or worker substitutability.

Guardrail test evidence: 7 suites/tests passed; source 100%, branches >97%.
Scaffold and contract invariants pass. Initial gate fails specifically for pending
inventory approval; no runtime refactor, permissions or data migration is included.
