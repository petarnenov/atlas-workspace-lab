package dev.atlaslab.worker.adapters.out;
import dev.atlaslab.worker.ports.LegacyHistory;
import dev.atlaslab.demo.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

public final class JdbcHistory implements LegacyHistory {
 private final JdbcTemplate db;private final TransactionTemplate tx;
 public JdbcHistory(JdbcTemplate db,PlatformTransactionManager transactions) {this.db=db;tx=new TransactionTemplate(transactions);}
 public boolean drained() {return db.queryForObject("SELECT count(*) FROM checkpoint WHERE outcome IS NULL OR sent=false OR lease_until>now()",Integer.class)==0;}
 public List<Copy> exportBatch(int maximum) {
  return db.query("SELECT p.*,c.correlation_id,c.fence,c.input_payload,c.outcome FROM parsed_document p JOIN checkpoint c ON c.event_id=p.event_id ORDER BY p.tenant_id,p.asset_id LIMIT ?",(rs,index)->{
   var input=Wire.event(rs.getString("input_payload"),true);
   if(!input.tenantId().equals(rs.getString("tenant_id"))||!input.assetId().equals(rs.getString("asset_id")))throw new IllegalStateException("Worker history scope mismatch");
   return new Copy(rs.getString("tenant_id"),rs.getString("asset_id"),rs.getString("event_id"),rs.getString("correlation_id"),rs.getString("source_sha256"),rs.getString("parser_version"),rs.getString("pipeline_version"),rs.getInt("page_count"),rs.getLong("fence"),null,rs.getString("markdown"),rs.getString("document"));
  },maximum);
 }
 public void restore(Copy copy) {
  tx.executeWithoutResult(status->{
   var rows=db.queryForList("SELECT * FROM checkpoint WHERE event_id=?::uuid FOR UPDATE",copy.inputEventId());
   if(rows.size()!=1)throw new IllegalStateException("Worker checkpoint missing; restore the reviewed ledger snapshot first");
   var row=rows.getFirst();var input=Wire.event(row.get("input_payload").toString(),true);
   if(!input.assetId().equals(copy.assetId())||!input.tenantId().equals(copy.tenantId())||!input.correlationId().equals(copy.correlationId())||row.get("outcome")==null||!Boolean.TRUE.equals(row.get("sent")))throw new IllegalStateException("Worker ledger binding mismatch");
   var outcome=Wire.JSON.valueToTree(Map.of());
   try {outcome=Wire.JSON.readTree(row.get("outcome").toString());}catch(Exception invalid){throw new IllegalStateException("Invalid durable outcome");}
   if(!outcome.path("outcome").asText().equals("COMPLETED"))throw new IllegalStateException("Cannot restore a failed result");
   if(outcome.path("schemaVersion").asText().equals("2")&&(!outcome.path("artifactId").asText().equals(copy.artifactId())||!outcome.path("inputEventId").asText().equals(copy.inputEventId())))throw new IllegalStateException("Durable artifact reference mismatch");
   db.update("INSERT INTO parsed_document(tenant_id,asset_id,event_id,source_sha256,parser_version,pipeline_version,page_count,markdown,document) VALUES(?::uuid,?::uuid,?::uuid,?,?,?,?,?,?) ON CONFLICT DO NOTHING",copy.tenantId(),copy.assetId(),copy.inputEventId(),copy.sourceSha256(),copy.converter(),copy.pipeline(),copy.pageCount(),copy.markdown(),copy.nativeJson());
   var saved=db.queryForMap("SELECT * FROM parsed_document WHERE tenant_id=?::uuid AND asset_id=?::uuid",copy.tenantId(),copy.assetId());
   if(!saved.get("event_id").toString().equals(copy.inputEventId())||!saved.get("source_sha256").equals(copy.sourceSha256())||!saved.get("markdown").equals(copy.markdown())||!saved.get("document").equals(copy.nativeJson())||!saved.get("parser_version").equals(copy.converter())||!saved.get("pipeline_version").equals(copy.pipeline())||((Number)saved.get("page_count")).intValue()!=copy.pageCount())throw new IllegalStateException("Legacy copy conflict");
  });
 }
 public List<Map<String,Object>> snapshot() {
  if(!drained())throw new IllegalStateException("Worker not drained");
  return db.query("SELECT * FROM checkpoint ORDER BY event_id LIMIT 1001",(rs,n)->{
   var value=new LinkedHashMap<String,Object>();value.put("inputEventId",rs.getString("event_id"));value.put("tenantId",rs.getString("tenant_id"));value.put("assetId",rs.getString("asset_id"));value.put("fence",rs.getLong("fence"));value.put("sent",rs.getBoolean("sent"));
   try {value.put("outcome",Wire.JSON.readTree(rs.getString("outcome")));}catch(Exception invalid){throw new IllegalStateException("Invalid durable outcome");}return value;
  });
 }
}
