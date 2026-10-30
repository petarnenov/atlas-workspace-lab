# LAB-106 verification evidence

Implementation: PR [#9](https://github.com/petarnenov/atlas-workspace-lab/pull/9).
Specification revision 1 and approval are recorded in `approval.md`.
Measured locally on 2026-10-31; CI results remain attached to the PR's exact head.
Passing local checks do not replace required CI or human review.

| Check | Result |
| --- | --- |
| Offline parser tests, exact distroless runtime | 18 passed; 90.53% source coverage |
| Gradle integration build / affected coverage gates | Passed; worker 295/310 lines (95.16%), BFF 76/81 (93.83%) |
| Native Kubernetes helpers | Passed; 98.34% lines, 94.56% branches |
| Helm helpers | Passed; 95.35% lines, 92.15% branches |
| Make inspection, credential and local bridge tests | Passed; source/branch gates >=75% |
| OpenAPI schema validation and official AsyncAPI parser with negative cases | Passed |
| Scaffold, architecture, contracts and frontend build/type checks | Passed (`make check`) |
| Parser runtime image vulnerability scan | Zero HIGH/CRITICAL findings; package inventory retained, no exclusions |
| Repository dependency/secret scan including locked AsyncAPI parser | Zero HIGH/CRITICAL findings |
| Real Helm dev upload, saved Markdown/JSON/API/Make read, tenant denial, independent parser deploy | 3 tests passed |
| Same real Helm prod demo scenarios | 3 tests passed |
| Helm identity/tenant/idempotency and asynchronous failure scenarios | Passed in both profiles (2 tests) |
| Full local Compose persistence/restart E2E suite | 7 tests passed |
| Live Kubernetes replicas in both profiles | Parser 3/3 Ready; worker 1/1 Ready |

The independent-deploy tests assert that only the parser Helm release changes.
The PDF quality fixture has hand-authored text, reading-order and table-cell
expectations; it does not derive expected output from the converter itself.
Failure tests cover invalid/encrypted/oversized inputs, authentication, tenant
denial, output bounds, timeouts, retry exhaustion, lease loss and atomic rollback.

The native/Helm and complete CI suites are tracked on PR #9. The Kubernetes
failure-outcome tests use an explicit 80-second bound because a valid conversion
may precede a rejected upload on the serial worker. Helm CI uses a separate kind
worker node with both profile pools running; this preserves exact application
requests/replicas on a four-CPU host without claiming a capacity benchmark.
Do not mark the final review task complete until required CI
and human review pass. This is synthetic demo evidence, not a production SLO.

Usage, resource costs, constraints and rollback:
[`LAB-106-DOCLING.md`](../../../docs/implementation/LAB-106-DOCLING.md).
