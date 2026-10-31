package dev.atlaslab.worker;

import dev.atlaslab.demo.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class Checkpoints {
  final JdbcTemplate db;
  final TransactionTemplate tx;

  public Checkpoints(JdbcTemplate db, PlatformTransactionManager manager) {
    this.db = db;
    this.tx = new TransactionTemplate(manager);
  }

  public void accept(String raw) {
    final Wire.Event input;
    try {
      input = Wire.event(raw, true);
    } catch (IllegalArgumentException invalid) {
      recordFinding(null, "INVALID_EVENT");
      return;
    }
    // A valid object reference must be a generated opaque UUID key, never an arbitrary URL/path.
    if (!input.objectKey().matches("[0-9a-f-]{36}\\.pdf")) {
      recordFinding(input.eventId(), "UNSAFE_OBJECT_KEY");
      return;
    }
    String payload = Wire.json(input),
        hash = PdfUpload.digest(payload.getBytes(StandardCharsets.UTF_8));
    tx.executeWithoutResult(
        status -> {
          int count =
              db.update(
                  "INSERT INTO"
                      + " checkpoint(event_id,tenant_id,asset_id,correlation_id,input_payload,input_hash)"
                      + " VALUES(?::uuid,?::uuid,?::uuid,?::uuid,?,?) ON CONFLICT DO NOTHING",
                  input.eventId(),
                  input.tenantId(),
                  input.assetId(),
                  input.correlationId(),
                  payload,
                  hash);
          if (count == 0) {
            List<String> old =
                db.query(
                    "SELECT input_hash FROM checkpoint WHERE event_id=?::uuid",
                    (rs, n) -> rs.getString(1),
                    input.eventId());
            if (old.isEmpty() || !old.getFirst().equals(hash))
              recordFinding(input.eventId(), "CONFLICTING_INPUT");
          }
        });
  }

  public Map<String, Object> claim() {
    return tx.execute(
        status -> {
          List<Map<String, Object>> rows =
              db.queryForList(
                  "SELECT * FROM checkpoint WHERE outcome IS NULL AND next_at<=now() AND"
                      + " (lease_until IS NULL OR lease_until<now()) ORDER BY next_at LIMIT 1 FOR"
                      + " UPDATE SKIP LOCKED");
          if (rows.isEmpty()) return null;
          String id = rows.getFirst().get("event_id").toString();
          return db.queryForMap(
              "UPDATE checkpoint SET fence=fence+1,attempts=attempts+1,lease_until=now()+interval"
                  + " '60 seconds' WHERE event_id=?::uuid RETURNING *",
              id);
        });
  }

  public boolean finish(Map<String, Object> lease, Wire.Event event) {
    return db.update(
            "UPDATE checkpoint SET outcome=?,lease_until=NULL,last_error=? WHERE event_id=?::uuid"
                + " AND fence=? AND lease_until>now() AND outcome IS NULL",
            Wire.json(event),
            event.errorCode(),
            lease.get("event_id").toString(),
            lease.get("fence"))
        == 1;
  }

  public boolean renew(Map<String, Object> lease) {
    return db.update(
            "UPDATE checkpoint SET lease_until=now()+interval '60 seconds' WHERE event_id=?::uuid"
                + " AND fence=? AND lease_until>now() AND outcome IS NULL",
            lease.get("event_id").toString(),
            lease.get("fence"))
        == 1;
  }

  public boolean finishParsed(
      Map<String, Object> lease, Wire.Event input, dev.atlaslab.worker.domain.WorkModel.Parsed parsed) {
    return Boolean.TRUE.equals(
        tx.execute(
            status -> {
              if (!finish(lease, Wire.outcome(input, null))) return false;
              db.update(
                  "INSERT INTO"
                      + " parsed_document(tenant_id,asset_id,event_id,source_sha256,parser_version,pipeline_version,page_count,markdown,document)"
                      + " VALUES(?::uuid,?::uuid,?::uuid,?,?,?,?,?,?)",
                  input.tenantId(),
                  input.assetId(),
                  input.eventId(),
                  parsed.hash(),
                  parsed.version(),
                  parsed.pipeline(),
                  parsed.pages(),
                  parsed.markdown(),
                  parsed.nativeJson());
              return true;
            }));
  }

  public void retry(Map<String, Object> lease) {
    db.update(
        "UPDATE checkpoint SET lease_until=NULL,next_at=now()+((power(2,attempts-1))::text||'"
            + " seconds')::interval,last_error='OBJECT_UNAVAILABLE' WHERE event_id=?::uuid AND"
            + " fence=? AND outcome IS NULL",
        lease.get("event_id").toString(),
        lease.get("fence"));
  }

  public void recordFinding(String event, String reason) {
    db.update("INSERT INTO worker_finding(event_id,reason) VALUES(?::uuid,?)", event, reason);
  }
  public java.util.List<dev.atlaslab.worker.domain.WorkModel.Publication> claimPublications() {
    var claimed=new java.util.ArrayList<dev.atlaslab.worker.domain.WorkModel.Publication>();
    for(var candidate:db.queryForList("SELECT event_id FROM checkpoint WHERE outcome IS NOT NULL AND sent=false AND publication_attempts<3 AND publish_after<=now() LIMIT 1")) {
      var rows=db.queryForList("UPDATE checkpoint SET publication_attempts=publication_attempts+1,publish_after=now()+interval '10 seconds' WHERE event_id=?::uuid AND outcome IS NOT NULL AND sent=false AND publication_attempts<3 AND publish_after<=now() RETURNING *",candidate.get("event_id").toString());
      if(!rows.isEmpty()) {
        var row=rows.getFirst();
        claimed.add(new dev.atlaslab.worker.domain.WorkModel.Publication(row.get("event_id").toString(),row.get("asset_id").toString(),row.get("correlation_id").toString(),((Number)row.get("publication_attempts")).intValue(),row.get("outcome").toString()));
      }
    }
    return claimed;
  }
  public void sent(String id) {
    db.update("UPDATE checkpoint SET sent=true,last_error=NULL WHERE event_id=?::uuid",id);
  }
  public void publicationFailed(String id) {
    db.update("UPDATE checkpoint SET last_error='BROKER_UNAVAILABLE',publish_after=now()+((power(2,publication_attempts-1))::text||' seconds')::interval WHERE event_id=?::uuid",id);
  }

  public boolean finishV2(Map<String,Object> lease,Wire.Event input,String artifactId,String error) {
    return db.update("UPDATE checkpoint SET outcome=?,lease_until=NULL,last_error=? WHERE event_id=?::uuid AND fence=? AND lease_until>now() AND outcome IS NULL",
      Wire.json(Wire.processedV2(input,artifactId,error)),error,lease.get("event_id").toString(),lease.get("fence"))==1;
  }

}
