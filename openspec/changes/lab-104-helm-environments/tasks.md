# Tasks — revision 1

- [x] Record synthetic LAB-104, user clarification that prod is a demo, principles,
      exact release/environment boundaries, design and acceptance scenarios.
- [x] Obtain explicit owner approval of this exact revision before implementation.
- [x] Pin supported Helm/checksums; add explicit Make tooling and guarded lifecycle.
- [x] Add platform/component charts, reviewed dev/prod values and validation schemas.
- [x] Implement isolated namespaces/credentials/PVCs/release ownership and shared
      cluster mutation locking while preserving existing native/Compose behavior.
- [x] Implement bounded platform bootstrap/proofs and independent app deployment,
      stop/up, owned forwards, status/logs and explicit compatible app rollback.
- [x] Add meaningful helper tests and >=75% measured coverage; validate both chart
      profiles, wrong-context/configuration/ownership/initialization failure paths.
- [x] Prove both environments and exact replica counts in kind E2E, including
      upload/auth/tenancy, cross-environment network denial, restart/duplicate/
      persistence recovery, independent upgrade and app rollback.
- [x] Run affected native/Compose/contracts/security gates and scan both profiles.
- [x] Document Make operations, resource measurements and prod demo limitations;
      update architecture compliance and capture sanitized verification evidence.
- [x] Submit PR with LAB-104, exact specification approval, versions and evidence.
- [ ] Require green CI and human review before merge; do not archive automatically.
