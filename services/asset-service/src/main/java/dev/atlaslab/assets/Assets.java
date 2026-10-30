package dev.atlaslab.assets;

import dev.atlaslab.demo.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class Assets {
  final JdbcTemplate db;
  final TransactionTemplate tx;
  final ObjectsStore objects;

  public Assets(JdbcTemplate db, PlatformTransactionManager manager, ObjectsStore objects) {
    this.db = db;
    this.tx = new TransactionTemplate(manager);
    this.objects = objects;
  }

  public Wire.Receipt upload(
      Identity.Context who, String key, String filename, String type, byte[] bytes) {
    PdfUpload.validate(filename, type, bytes);
    if (key != null && (key.isBlank() || key.length() > 128))
      throw new HttpFailure(400, "INVALID_KEY", "Invalid Idempotency-Key");
    String digest = PdfUpload.digest(bytes);
    // Session-level lock spans durable intent, external write and final transaction.
    // It is held on its dedicated connection and automatically released on process loss.
    String scope =
        who.tenant() + ":" + who.subject() + ":" + (key == null ? UUID.randomUUID() : key);
    try (Connection lock = db.getDataSource().getConnection()) {
      lock.setAutoCommit(true);
      try (PreparedStatement st =
          lock.prepareStatement("SELECT pg_advisory_lock(hashtextextended(?,0))")) {
        st.setString(1, scope);
        st.execute();
      }
      try {
        return lockedUpload(who, key, digest, bytes, scope);
      } finally {
        try (PreparedStatement st =
            lock.prepareStatement("SELECT pg_advisory_unlock(hashtextextended(?,0))")) {
          st.setString(1, scope);
          st.execute();
        }
      }
    } catch (SQLException e) {
      throw new HttpFailure(503, "UNAVAILABLE", "Database unavailable");
    }
  }

  private Wire.Receipt lockedUpload(
      Identity.Context who, String key, String digest, byte[] bytes, String scope) {
    List<Map<String, Object>> previous =
        key == null
            ? List.of()
            : db.queryForList(
                "SELECT * FROM upload_intent WHERE tenant_id=?::uuid AND subject=? AND idem_key=?"
                    + " AND expires_at>now()",
                who.tenant(),
                who.subject(),
                key);
    if (!previous.isEmpty()) {
      Map<String, Object> row = previous.getFirst();
      if (!digest.equals(row.get("digest")))
        throw new HttpFailure(400, "KEY_REUSED", "Key already used for different content");
      if (Boolean.TRUE.equals(row.get("committed"))) return receipt(row);
      // Recover interrupted object write with exactly the reserved IDs/key.
      return persist(row, bytes);
    }
    String id = UUID.randomUUID().toString(),
        correlation = UUID.randomUUID().toString(),
        objectKey = UUID.randomUUID() + ".pdf";
    tx.executeWithoutResult(
        status -> {
          if (key != null)
            db.update(
                "UPDATE upload_intent SET idem_key=NULL WHERE tenant_id=?::uuid AND subject=? AND"
                    + " idem_key=? AND expires_at<=now()",
                who.tenant(),
                who.subject(),
                key);
          db.update(
              "INSERT INTO"
                  + " upload_intent(asset_id,tenant_id,subject,idem_key,digest,object_key,correlation_id,lock_scope)"
                  + " VALUES(?::uuid,?::uuid,?,?,?,?,?::uuid,?)",
              id,
              who.tenant(),
              who.subject(),
              key,
              digest,
              objectKey,
              correlation,
              scope);
        });
    return persist(db.queryForMap("SELECT * FROM upload_intent WHERE asset_id=?::uuid", id), bytes);
  }

  private Wire.Receipt persist(Map<String, Object> row, byte[] bytes) {
    String id = row.get("asset_id").toString(), objectKey = row.get("object_key").toString();
    try {
      objects.put(objectKey, bytes);
      tx.executeWithoutResult(
          status -> {
            db.update(
                "INSERT INTO asset(asset_id,tenant_id,object_key,correlation_id,status)"
                    + " VALUES(?::uuid,?::uuid,?,?::uuid,'PENDING')",
                id,
                row.get("tenant_id").toString(),
                objectKey,
                row.get("correlation_id").toString());
            Wire.Event event =
                Wire.uploaded(
                    id,
                    row.get("tenant_id").toString(),
                    row.get("correlation_id").toString(),
                    objectKey);
            db.update(
                "INSERT INTO upload_outbox(event_id,asset_id,payload) VALUES(?::uuid,?::uuid,?)",
                event.eventId(),
                id,
                Wire.json(event));
            db.update("UPDATE upload_intent SET committed=true WHERE asset_id=?::uuid", id);
          });
      return receipt(row);
    } catch (Exception failure) {
      // A commit-acknowledgement loss is ambiguous. Never delete possibly committed content.
      try {
        Integer count =
            db.queryForObject(
                "SELECT count(*) FROM asset WHERE asset_id=?::uuid", Integer.class, id);
        if (count != null && count > 0) return receipt(row);
        objects.delete(objectKey);
        db.update("DELETE FROM upload_intent WHERE asset_id=?::uuid AND committed=false", id);
      } catch (Exception ignored) {
        /* Durable intent retained for reconciliation. */
      }
      throw new HttpFailure(503, "UNAVAILABLE", "Upload temporarily unavailable");
    }
  }

  private Wire.Receipt receipt(Map<String, Object> row) {
    return new Wire.Receipt(
        row.get("asset_id").toString(), "PENDING", row.get("correlation_id").toString());
  }

  public Wire.Detail read(Identity.Context who, String id) {
    List<Wire.Detail> rows =
        db.query(
            "SELECT * FROM asset WHERE tenant_id=?::uuid AND asset_id=?::uuid",
            (rs, n) ->
                new Wire.Detail(
                    rs.getString("asset_id"),
                    rs.getString("status"),
                    rs.getLong("version"),
                    rs.getTimestamp("created_at").toInstant().toString(),
                    rs.getTimestamp("updated_at").toInstant().toString(),
                    rs.getString("error_code")),
            who.tenant(),
            Wire.uuid(id));
    if (rows.isEmpty()) throw new HttpFailure(404, "NOT_FOUND", "Asset not found");
    return rows.getFirst();
  }

  public void outcome(String raw) {
    final Wire.Event e;
    try {
      e = Wire.event(raw, false);
    } catch (IllegalArgumentException invalid) {
      finding(null, "INVALID_EVENT");
      return;
    }
    String hash = PdfUpload.digest(raw.getBytes(StandardCharsets.UTF_8));
    tx.executeWithoutResult(
        status -> {
          List<Map<String, Object>> assets =
              db.queryForList("SELECT * FROM asset WHERE asset_id=?::uuid FOR UPDATE", e.assetId());
          if (assets.isEmpty()) {
            finding(e.eventId(), "UNKNOWN_ASSET");
            return;
          }
          Map<String, Object> a = assets.getFirst();
          if (!a.get("tenant_id").toString().equals(e.tenantId())
              || !a.get("correlation_id").toString().equals(e.correlationId())) {
            finding(e.eventId(), "SCOPE_MISMATCH");
            return;
          }
          int inserted =
              db.update(
                  "INSERT INTO outcome_seen VALUES(?::uuid,?) ON CONFLICT DO NOTHING",
                  e.eventId(),
                  hash);
          if (inserted == 0) {
            if (!hash.equals(
                db.queryForObject(
                    "SELECT payload_hash FROM outcome_seen WHERE event_id=?::uuid",
                    String.class,
                    e.eventId()))) finding(e.eventId(), "EVENT_ID_REUSED");
            return;
          }
          if (!a.get("status").equals("PROCESSING")) {
            finding(e.eventId(), "TERMINAL_OR_OUT_OF_ORDER");
            return;
          }
          db.update(
              "UPDATE asset SET status=?,error_code=?,version=version+1,updated_at=now() WHERE"
                  + " asset_id=?::uuid",
              e.outcome(),
              e.errorCode(),
              e.assetId());
        });
  }

  void finding(String event, String reason) {
    db.update("INSERT INTO asset_finding(event_id,reason) VALUES(?::uuid,?)", event, reason);
  }
}
