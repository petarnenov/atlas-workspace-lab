package dev.atlaslab.worker.bootstrap;
import dev.atlaslab.worker.adapters.out.JdbcHistory;
import dev.atlaslab.worker.application.HistoryMigration;
import dev.atlaslab.worker.ports.LegacyHistory;
import dev.atlaslab.demo.adapters.out.MaintenanceFiles;
import java.nio.file.Path;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;

/** Separate CLI process: no HTTP server, Kafka consumer, scheduler or parser starts. */
public final class WorkerMaintenance {
 public static void main(String[] args) throws Exception { run(args,System.getenv()); }
 public static void run(String[] args,Map<String,String> env) throws Exception {
  if(!"dev".equals(env.getOrDefault("ENV","dev"))||!"1".equals(env.get("ATLAS_MAINTENANCE_PAUSED")))throw new IllegalStateException("Dev maintenance requires an explicit paused window");
  if(args.length!=2)throw new IllegalArgumentException("Expected action and private file path");
  var ds=new DriverManagerDataSource(env.getOrDefault("WORKER_DB_URL","jdbc:postgresql://localhost:5432/worker_checkpoint"),"worker_owner",env.get("LAB_WORKER_DB_PASSWORD"));
  var history=new JdbcHistory(new JdbcTemplate(ds),new DataSourceTransactionManager(ds));var app=new HistoryMigration(history);var file=Path.of(args[1]);
  switch(args[0]) {
   case "snapshot" -> MaintenanceFiles.write(file,"worker-ledger",history.snapshot());
   case "export" -> MaintenanceFiles.write(file,"worker-copies",app.export().stream().map(c->new MaintenanceFiles.Copy(c.tenantId(),c.assetId(),c.inputEventId(),c.correlationId(),c.sourceSha256(),c.converter(),c.pipeline(),c.pageCount(),c.fence(),c.artifactId(),c.markdown(),c.nativeJson(),MaintenanceFiles.hash(c.markdown()),MaintenanceFiles.hash(c.nativeJson()))).toList());
   case "restore" -> {
    var copies=new ArrayList<LegacyHistory.Copy>();
    for(var row:MaintenanceFiles.read(file,"asset-copies")) {var c=MaintenanceFiles.copy(row);copies.add(new LegacyHistory.Copy(c.tenantId(),c.assetId(),c.inputEventId(),c.correlationId(),c.sourceSha256(),c.converter(),c.pipeline(),c.pageCount(),c.fence(),c.artifactId(),c.markdown(),c.nativeJson()));}
    app.restore(copies);
   }
   default -> throw new IllegalArgumentException("Unknown worker maintenance action");
  }
 }
}
