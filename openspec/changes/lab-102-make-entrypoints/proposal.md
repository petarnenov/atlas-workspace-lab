# LAB-102 — Make entry points

Revision: 1. Status: APPROVED for implementation; see approval.md.
Tracking: synthetic story LAB-102 — As a contributor, I can set up, run and verify the local demo through make.

Add a root Makefile with discoverable targets for every documented local operation and existing root package script. Add make doctor and make setup. Keep pnpm/Nx, Gradle and existing local scripts as the underlying implementation.

Applicable principles: P02/P03 (ownership and contracts unchanged), P05 (no new infrastructure), P06–P10 (preserve local credentials and synthetic-data boundaries), P15/P19 (exact revision approval and verification), P16/P18 (repeatable setup and explicit failures), P20 (validate documented tool versions). Other principles introduce no new capabilities here. No HTTP, event, identity or security contract changes are proposed.

Review proposal.md, design.md, tasks.md and specs/local-development/spec.md together as revision 1. Implementation must wait for explicit approval of this revision.
