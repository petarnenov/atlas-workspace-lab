package dev.atlaslab.assets;

import dev.atlaslab.demo.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class AssetEvents {
  private final Assets assets;
  private final KafkaTemplate<String, String> kafka;

  public AssetEvents(Assets assets, KafkaTemplate<String, String> kafka) {
    this.assets = assets;
    this.kafka = kafka;
  }

  @KafkaListener(topics = "asset.processed.v1")
  public void receive(String raw) {
    assets.outcome(raw);
  }

  @Scheduled(fixedDelayString = "${lab.dispatch-delay:1000}")
  public void dispatch() {
    // Transaction/row lock serializes dispatchers. Attempts are durable even if send/ack is lost.
    for (Map<String, Object> candidate :
        assets.db.queryForList(
            "SELECT event_id FROM upload_outbox WHERE sent=false AND attempts<3 AND next_at<=now()"
                + " ORDER BY next_at LIMIT 10")) {
      assets.tx.executeWithoutResult(
          status -> {
            List<Map<String, Object>> rows =
                assets.db.queryForList(
                    "SELECT * FROM upload_outbox WHERE event_id=?::uuid AND sent=false AND"
                        + " attempts<3 AND next_at<=now() FOR UPDATE SKIP LOCKED",
                    candidate.get("event_id").toString());
            if (rows.isEmpty()) return;
            Map<String, Object> row = rows.getFirst();
            String id = row.get("asset_id").toString();
            // Separate committed transition before broker publication; persisted outbox bridges
            // crashes.
            assets.db.update(
                "UPDATE asset SET status='PROCESSING',version=version+1,updated_at=now() WHERE"
                    + " asset_id=?::uuid AND status='PENDING'",
                id);
          });
      // Claim the send attempt durably before the network call; only one local dispatcher is
      // scheduled.
      Map<String, Object> row =
          assets.tx.execute(
              status -> {
                List<Map<String, Object>> rows =
                    assets.db.queryForList(
                        "UPDATE upload_outbox SET attempts=attempts+1,next_at=now()+interval '10"
                            + " seconds' WHERE event_id=?::uuid AND sent=false AND attempts<3 AND"
                            + " next_at<=now() RETURNING *",
                        candidate.get("event_id").toString());
                return rows.isEmpty() ? null : rows.getFirst();
              });
      if (row == null) continue;
      try {
        kafka
            .send(
                "asset.uploaded.v1", row.get("asset_id").toString(), row.get("payload").toString())
            .get(6, TimeUnit.SECONDS);
        assets.db.update(
            "UPDATE upload_outbox SET sent=true,last_error=NULL WHERE event_id=?::uuid",
            row.get("event_id").toString());
      } catch (Exception failure) {
        assets.db.update(
            "UPDATE upload_outbox SET"
                + " last_error='BROKER_UNAVAILABLE',next_at=now()+((power(2,attempts-1))::text||'"
                + " seconds')::interval WHERE event_id=?::uuid",
            row.get("event_id").toString());
      }
    }
  }

  @Scheduled(fixedDelayString = "${lab.reconcile-delay:60000}")
  public void reconcile() {
    assets.db.update(
        "UPDATE asset SET"
            + " status='FAILED',error_code='RETRY_EXHAUSTED',version=version+1,updated_at=now()"
            + " WHERE status='PROCESSING' AND updated_at<now()-interval '15 minutes'");
    // Expired upload intents are reconciled only under the same per-request advisory lock.
    for (Map<String, Object> row :
        assets.db.queryForList(
            "SELECT * FROM upload_intent WHERE committed=false AND created_at<now()-interval '10"
                + " minutes' LIMIT 20")) {
      String scope = row.get("lock_scope").toString();
      try (java.sql.Connection c = assets.db.getDataSource().getConnection();
          java.sql.PreparedStatement st =
              c.prepareStatement("SELECT pg_try_advisory_lock(hashtextextended(?,0))")) {
        st.setString(1, scope);
        try (java.sql.ResultSet rs = st.executeQuery()) {
          if (!rs.next() || !rs.getBoolean(1)) continue;
          try {
            Integer count =
                assets.db.queryForObject(
                    "SELECT count(*) FROM asset WHERE asset_id=?::uuid",
                    Integer.class,
                    row.get("asset_id").toString());
            if (count != null && count == 0) {
              assets.objects.delete(row.get("object_key").toString());
              assets.db.update(
                  "DELETE FROM upload_intent WHERE asset_id=?::uuid AND committed=false",
                  row.get("asset_id").toString());
            }
          } finally {
            try (java.sql.PreparedStatement unlock =
                c.prepareStatement("SELECT pg_advisory_unlock(hashtextextended(?,0))")) {
              unlock.setString(1, scope);
              unlock.execute();
            }
          }
        }
      } catch (Exception ignored) {
        /* Intent remains inspectable for next cycle. */
      }
    }
  }
}
