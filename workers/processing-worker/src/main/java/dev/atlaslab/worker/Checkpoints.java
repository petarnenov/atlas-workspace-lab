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
      finding(null, "INVALID_EVENT");
      return;
    }
    // A valid object reference must be a generated opaque UUID key, never an arbitrary URL/path.
    if (!input.objectKey().matches("[0-9a-f-]{36}\\.pdf")) {
      finding(input.eventId(), "UNSAFE_OBJECT_KEY");
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
              finding(input.eventId(), "CONFLICTING_INPUT");
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

  public void retry(Map<String, Object> lease) {
    db.update(
        "UPDATE checkpoint SET lease_until=NULL,next_at=now()+((power(2,attempts-1))::text||'"
            + " seconds')::interval,last_error='OBJECT_UNAVAILABLE' WHERE event_id=?::uuid AND"
            + " fence=? AND outcome IS NULL",
        lease.get("event_id").toString(),
        lease.get("fence"));
  }

  void finding(String event, String reason) {
    db.update("INSERT INTO worker_finding(event_id,reason) VALUES(?::uuid,?)", event, reason);
  }
}
