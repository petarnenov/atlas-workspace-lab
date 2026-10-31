# LAB-108 refactoring status

The current strict static inventory is empty. The baseline contains no accepted
violations; the historical pending inventory below is retained for traceability,
not grandfathered. Runtime integration, security, migration, substitution and
human review evidence are still required before declaring LAB-108 complete.

Layer corrections accompany actual extraction: Identity is a JWT/crypto adapter,
Wire a JSON transport codec, Checkpoints a JDBC ledger, and WorkerEvents a thin
listener/scheduler over ProcessingKernel. Asset upload/outcome/delivery decisions
moved behind typed application-owned ports. These are not blanket legacy exemptions.
Python module imports/classes are checked separately from calls to a converter
port; invoking `converter.convert` does not import the adapter module `convert`.

## Historical LAB-107 inventory (before refactoring)

# Initial debt inventory — pending owner review

148 findings (122 exact rule/path/fragment entries).
Scope is the existing backend source and core contracts, not just LAB-106.

| File | Findings |
| --- | --- |
| libraries/demo-support/src/main/java/dev/atlaslab/demo/Identity.java | 3 |
| libraries/demo-support/src/main/java/dev/atlaslab/demo/PdfUpload.java | 6 |
| libraries/demo-support/src/main/java/dev/atlaslab/demo/Wire.java | 3 |
| services/asset-service/src/main/java/dev/atlaslab/assets/AssetEvents.java | 23 |
| services/asset-service/src/main/java/dev/atlaslab/assets/Assets.java | 54 |
| workers/processing-worker/src/main/java/dev/atlaslab/worker/Checkpoints.java | 33 |
| workers/processing-worker/src/main/java/dev/atlaslab/worker/ParsedHttp.java | 2 |
| workers/processing-worker/src/main/java/dev/atlaslab/worker/WorkerEvents.java | 24 |

The exact SHA-256 fingerprints, occurrence counts, owner, rationale and review
date are in debt-baseline.json. This is not approved debt or compliance.
Review the exact committed inventory before changing approval to owner-reviewed.
Initial gate intentionally fails while approval is pending. No runtime changes
are included; a passing ratchet after review would still report this debt.

Run make architecture-inventory for source fragments and line references; the
command prints diagnostics only and never overwrites the baseline.
