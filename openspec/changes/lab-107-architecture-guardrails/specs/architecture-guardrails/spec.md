# Architecture guardrails — revision 1

- Core SHALL depend on application-owned ports and neutral types. Provider/store
  substitution SHALL not require processing use-case source changes.
- Checks SHALL reject new forbidden dependencies and provider leakage, including
  new files in legacy roots and qualified references, not only import statements.
- Debt SHALL be individually inventoried, owner-reviewed, time-bounded and always
  reported. No blanket or automatic baseline acceptance.
- Strict audit SHALL fail on all debt. Ratchet SHALL fail on new, changed,
  broadened, expired or stale baseline entries and state its limited meaning.
- Fixtures SHALL cover happy/failure/bypass cases and >=75% measured checker
  source/branch coverage; existing checks SHALL stay active.
- Make/pnpm/CI SHALL run the same implementation offline.
- Future feature designs SHALL identify ADRs, dependency direction, ports/types,
  owners, substitution evidence and storage consistency semantics.
- This change SHALL NOT alter runtime APIs/events, credentials or stored data.

Scenarios/syntax limits are specified in design.md. Runtime contract tests must
prove real substitution in the follow-up; static scans alone are not compliance.
