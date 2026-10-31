# LAB-107 — Architecture documentation and enforcement

Revision 1. Status: proposed; exact owner approval pending.
Synthetic story: prevent recurrence of LAB-106 provider/storage coupling.

Record ADR-0001/0002, update instructions, and add deterministic offline Node
architecture checks, negative-fixture tests and Make/pnpm/CI gates. Applies
P01–P03/P05/P08/P09/P12/P15/P16/P18–P20. Runtime HTTP/event contracts unchanged.
New tooling contract: versioned architecture policy and diagnostic/baseline schema.

Exclude runtime refactoring, data migration, provider switching, new credentials,
network policies and infrastructure. Existing LAB-106 debt remains visible.
Documentation prepares review; no accepted ADR or compliant runtime is claimed.
