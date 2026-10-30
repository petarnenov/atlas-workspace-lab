# Local verification — 2026-10-30

- make test-tools: 7 tests pass; helper coverage 83.52% lines,
  85.37% branches, 93.33% functions; 75% gates enforced.
- make check: scaffold, architecture and contract invariants pass.
- make help: supported targets are discoverable without project dependencies.
- make doctor: Node 24, pnpm 10, Java/javac 21, Docker CLI and daemon pass;
  installed Compose does not satisfy approved v2 requirement. Setup/dev therefore
  stop at prerequisite validation. Full local startup remains unverified here.
- Security scan requested via make security; reports remain ignored under .local.

Human PR review and CI remain required. No merge or archive performed.
- make security: passed; repository and all five image scans report zero
  HIGH/CRITICAL findings; repository reports zero secrets.
- git diff --check: passed.

## Continued verification

- make build: Java assemble and UI typecheck/Vite production build pass.
- make up: images build and PostgreSQL/Kafka/storage become healthy using
  installed Compose v5.1.3; Kafka and storage initialization succeed.
- make test: tooling, Java unit, frontend and Java integration stages pass;
  Java measured coverage gates pass. Frontend: 21 tests, 100% lines, 95.4% branches.
- make prepare: complete existing credentials preserved.
- make token TENANT=invalid: rejects input before token generation.
- Process supervision now signals owned process groups, including descendants.
  Updated helper coverage: 82.47% lines, 81.82% branches, 93.75% functions.
- Compose revision 2 proposed separately; no approval presumed and doctor remains
  restricted to the approved major version 2 until explicit amendment approval.

## Final revision 2 verification

- Repository owner approved revision 2 in conversation before the doctor change.
- make doctor and make setup: pass with Compose v5.1.3; locked dependencies
  installed and existing credentials preserved. Chromium installation succeeds.
- All 7 E2E scenarios pass (1.5 minutes); full make test sequence succeeds.
- Updated helper suite: 8 tests pass; 82.47% lines, 81.82% branches,
  93.75% functions; 75% gates enforced and added to foundation CI job.
- make dev: UI returns HTTP 200; API responds HTTP 401 without a token as expected.
  Ctrl+C exits the command and stops owned applications; dependency data retained.
- Historical Compose-v2-only limitation above is resolved by approved revision 2.
