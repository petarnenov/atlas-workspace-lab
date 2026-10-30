# LAB-102: expose local workflows through Make

Contributors can run `make doctor`, `make setup` and `make dev` from the repository
root. All documented build, test, dependency and security operations have Make
entry points; setup preserves credentials and development shutdown stops owned
application process groups while retaining dependency data.

Tracking: synthetic story LAB-102 in proposal.md. Scope and approval evidence:
revision 1 documents, approval.md and approved compose-revision-2.md. Components:
root Makefile, local Node helpers/tests, foundation CI, README and runbook.
Application HTTP/event contracts and security boundaries are unchanged.

Validation: make doctor/setup/build/up/check/test; 7 E2E scenarios and 8 helper
tests pass; helper coverage exceeds 75% on lines/branches/functions. Repository
and image security scans pass. Foreground dev startup and Ctrl+C verified.
See evidence.md for measured results. Human PR review and CI are required before
merge; this remains a synthetic local demo.
