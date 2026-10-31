package dev.atlaslab.assets.adapters.out;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
/** Operator-only snapshot of asset-owned metadata. Bodies are exported through verified reads. */
public final class JdbcArtifactArchive {
 private final JdbcTemplate db;
 public JdbcArtifactArchive(JdbcTemplate db) {this.db=db;}
 public void requireDrained() {
  if(db.queryForObject("SELECT (SELECT count(*) FROM asset WHERE status IN ('PENDING','PROCESSING'))+(SELECT count(*) FROM upload_outbox WHERE sent=false)",Integer.class)!=0)throw new IllegalStateException("Asset uploads/publications not drained");
 }
 public List<Map<String,Object>> snapshot() {
  requireDrained();
  return db.query("SELECT * FROM derived_artifact ORDER BY tenant_id,artifact_id LIMIT 1001",(rs,n)->{
   var row=new LinkedHashMap<String,Object>();
   for(String column:List.of("tenant_id","asset_id","artifact_id","input_event_id","correlation_id","state","source_sha256","markdown_hash","native_hash"))row.put(column,rs.getString(column));
   return row;
  });
 }
}
