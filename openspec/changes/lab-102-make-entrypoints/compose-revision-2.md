# LAB-102 revision 2 — Compose compatibility amendment

Status: APPROVED on 2026-10-30 by repository owner in task conversation (“одобравям”), responding to the explicit revision 2 approval request.
All revision 1 requirements remain except the Compose major-version restriction.
Doctor shall accept the Docker Compose CLI plugin at major version 2 or later,
including the locally installed v5.1.3, and reject legacy standalone Compose v1.
The existing startup and integration/E2E checks must verify the required compose
build, up --wait, run, stop and ps behavior. No infrastructure, data ownership,
credentials, security or versioned application contracts change.

Rationale: the local Docker installation supplies plugin v5.1.3. Requiring only
major 2 prevents setup/dev despite the existing local harness using this plugin.
Approval covers this amendment together with all revision 1 documents.
