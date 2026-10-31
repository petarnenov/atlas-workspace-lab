package dev.atlaslab.worker.application;
import dev.atlaslab.worker.ports.LegacyHistory;
import java.util.List;
/** Explicit, paused/drained compatibility path; never fabricates native output. */
public final class HistoryMigration {
 private final LegacyHistory history;
 public HistoryMigration(LegacyHistory history) {this.history=history;}
 public List<LegacyHistory.Copy> export() {
  requireDrained();var rows=history.exportBatch(1001);
  if(rows.size()>1000)throw new IllegalStateException("Maintenance batch exceeds 1000; narrow the tenant scope");
  return rows;
 }
 public void restore(List<LegacyHistory.Copy> copies) {
  requireDrained();
  if(copies.size()>1000)throw new IllegalArgumentException("Maintenance batch exceeds 1000");
  // Preflight the whole batch before writing any compatibility rows.
  for(var copy:copies)if(copy.nativeJson()==null)throw new IllegalStateException("Native output absent: migrate legacy clients to v2 before replacing this parser");
  for(var copy:copies)history.restore(copy);
 }
 private void requireDrained() {if(!history.drained())throw new IllegalStateException("Pause uploads, drain processing and publication before maintenance");}
}
