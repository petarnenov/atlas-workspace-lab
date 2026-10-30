# Local development — revision 1

## Requirements and scenarios

1. Running make or make help lists supported commands without starting services or requiring installed project dependencies.
2. With supported prerequisites, make doctor succeeds. With missing or unsupported tools or an unavailable Docker daemon it reports actionable failures and exits nonzero without modifying state or exposing credentials.
3. From a fresh checkout, make setup installs locked dependencies, prepares ignored local credentials and installs Chromium. Repeating setup preserves complete credentials; partial credentials cause a clear failure without overwriting files. Failed subprocesses propagate failure and stop dependent steps.
4. After setup, make dev builds artifacts and starts dependencies, Java applications and the UI. Interrupting it stops owned application children; a child startup/runtime failure terminates siblings and returns failure. Persistent dependency data remains intact.
5. Every operation documented in README and every root package script has a make entry point with equivalent behavior and propagated exit status. Token generation supports only synthetic tenants a and b.
6. Test suites run sequentially; failure stops the sequence. Existing coverage thresholds remain enforced. Documentation retains the disposable-environment and synthetic-data limitations.
7. Make stop preserves dependency volumes. No target prints secret file contents or silently resets credentials/data.
