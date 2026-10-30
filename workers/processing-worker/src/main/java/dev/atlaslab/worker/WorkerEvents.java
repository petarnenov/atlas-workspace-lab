package dev.atlaslab.worker;

import dev.atlaslab.demo.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class WorkerEvents {
  final Checkpoints checkpoints;
  final ObjectsStore objects;
  final Sandbox sandbox;
  final KafkaTemplate<String, String> kafka;

  public WorkerEvents(
      Checkpoints checkpoints,
      ObjectsStore objects,
      Sandbox sandbox,
      KafkaTemplate<String, String> kafka) {
    this.checkpoints = checkpoints;
    this.objects = objects;
    this.sandbox = sandbox;
    this.kafka = kafka;
  }

  @KafkaListener(topics = "asset.uploaded.v1")
  public void receive(String raw) {
    checkpoints.accept(raw);
  }

  @Scheduled(fixedDelayString = "${lab.worker-delay:500}")
  public void process() {
    Map<String, Object> lease = checkpoints.claim();
    if (lease == null) return;
    Wire.Event input = Wire.event(lease.get("input_payload").toString(), true);
    int attempts = ((Number) lease.get("attempts")).intValue();
    if (attempts > 3) {
      checkpoints.finish(lease, Wire.outcome(input, "RETRY_EXHAUSTED"));
      return;
    }
    try {
      String error = sandbox.inspect(objects.get(input.objectKey()));
      checkpoints.finish(lease, Wire.outcome(input, error));
    } catch (Exception transientFailure) {
      if (attempts >= 3) checkpoints.finish(lease, Wire.outcome(input, "RETRY_EXHAUSTED"));
      else checkpoints.retry(lease);
    }
  }

  @Scheduled(fixedDelayString = "${lab.publisher-delay:500}")
  public void publish() {
    for (Map<String, Object> candidate :
        checkpoints.db.queryForList(
            "SELECT event_id FROM checkpoint WHERE outcome IS NOT NULL AND sent=false AND"
                + " publication_attempts<3 AND publish_after<=now() LIMIT 10")) {
      List<Map<String, Object>> rows =
          checkpoints.db.queryForList(
              "UPDATE checkpoint SET"
                  + " publication_attempts=publication_attempts+1,publish_after=now()+interval '10"
                  + " seconds' WHERE event_id=?::uuid AND outcome IS NOT NULL AND sent=false AND"
                  + " publication_attempts<3 AND publish_after<=now() RETURNING *",
              candidate.get("event_id").toString());
      if (rows.isEmpty()) continue;
      Map<String, Object> row = rows.getFirst();
      try {
        kafka
            .send(
                "asset.processed.v1", row.get("asset_id").toString(), row.get("outcome").toString())
            .get(6, TimeUnit.SECONDS);
        checkpoints.db.update(
            "UPDATE checkpoint SET sent=true,last_error=NULL WHERE event_id=?::uuid",
            row.get("event_id").toString());
      } catch (Exception failure) {
        checkpoints.db.update(
            "UPDATE checkpoint SET"
                + " last_error='BROKER_UNAVAILABLE',publish_after=now()+((power(2,publication_attempts-1))::text||'"
                + " seconds')::interval WHERE event_id=?::uuid",
            row.get("event_id").toString());
      }
    }
  }
}
