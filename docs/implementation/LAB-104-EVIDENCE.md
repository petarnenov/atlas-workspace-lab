# LAB-104 verification evidence

Owner approved OpenSpec revision 1 (`0cfb4d6`) in the task conversation before
feature implementation; see change approval.md. Synthetic story LAB-104.

Local verification on macOS arm64, JDK 21 / Node 24, Docker 8 CPUs / 16 GiB,
kind Kubernetes 1.35.8, Helm 4.3.1:

- Both environment setups/builds and five-release startup passed.
- Native Kubernetes helper regression: 98.88% lines, 94.48% branches,
  95.77% functions. Existing default behavior retained.
- `make check`: scaffold, architecture and contract invariants passed.
- Trivy chart-source secrets, both effective rendered Kubernetes profiles,
  unique workload images and repository dependency/secrets scans passed with
  HIGH/CRITICAL failure threshold. Rendered output must contain Kubernetes
  scan results; silently unrecognized files fail the check.
- Both environments plus existing native namespace occupied about 4.7 GiB in
  the kind node during testing (Docker stats; no Kubernetes metrics server).
  This is an observed snapshot, not a capacity or availability guarantee.
- Real kind E2E: all 19 scenarios passed in 11 minutes across both profiles,
  including independent upgrade/rollback, retained stop/up and denial in both
  cross-environment directions.
- Helm helper coverage: approximately 96% source lines, 94% branches and 92%
  functions; installer and security helper lines are fully covered.
- Existing Compose integration/E2E/security, frontend, Java unit, contracts and
  scaffold CI passed on dbbb3cb. Final-head CI and human review remain required;
  current results are attached to PR #7.

First dev startup exposed the UI's dependency on the API Service DNS existing
before nginx starts. Startup now installs API, assets and worker before UI.
The unsuccessful initial UI release was retained and recovered by explicit up;
no PVC or credential deletion was needed. Positive/negative network proofs and
bootstrap hooks remain bounded, idempotent and fail closed.
