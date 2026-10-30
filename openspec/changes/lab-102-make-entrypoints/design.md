# Design — revision 1

Use a root Makefile with help as its default target and documented phony targets. Delegate orchestration to existing tooling; use Node.js for any nontrivial validation or process lifecycle logic. Support macOS system Make and GNU Make on Linux.

Targets: help, doctor, setup, prepare, up, stop, status, apps, dev, ui, token (TENANT=a or b), build, build-ui, test, test-java, test-frontend, test-integration, test-e2e, check, check-scaffold, check-architecture, check-contracts, graph, affected-build, affected-test, measure-builds, install-trivy, security. Document each mapping in help and README.

Doctor checks Node 24, pnpm 10, JDK 21 including javac, Docker CLI, Compose v2 and reachable daemon. Report all failures with actionable remedies and a failing exit status; do not install software, print secrets or mutate local state. Missing local credentials are reported as setup guidance, not a prerequisite failure. Port checks belong to startup diagnostics, so a running demo does not make doctor fail.

Setup runs prerequisite validation, frozen-lockfile dependency installation, safe credential preparation and Playwright Chromium installation. It does not install host runtimes, run security installers or start containers. Reuse complete existing .env and signing keys without changing contents or permissions; reject partial credential state with recovery guidance, never silently regenerate keys or credentials.

Up provisions existing dependencies; apps runs the existing Java harness; ui runs Vite on loopback. Dev builds runnable Java artifacts, starts dependencies and supervises the Java harness and UI in one foreground command; Ctrl+C and child failure stop all owned child processes, preserving Docker volumes. Stop stops Compose dependencies without removing data. Avoid concurrent integration and E2E execution. Test runs Java, frontend, integration and E2E sequentially; check runs all existing scaffold, architecture and contract checks. Security remains an explicit target with its prerequisite documented. No destructive reset target.
