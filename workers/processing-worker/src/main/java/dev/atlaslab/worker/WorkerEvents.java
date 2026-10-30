package dev.atlaslab.worker;

import dev.atlaslab.demo.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class WorkerEvents {
  private static final Logger LOG = LoggerFactory.getLogger(WorkerEvents.class);
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
    LOG.info("input_received");
    checkpoints.accept(raw);
  }

  @Scheduled(fixedDelayString = "${lab.worker-delay:500}")
  public void process() {
    Map<String, Object> lease = checkpoints.claim();
    if (lease == null) return;
    Wire.Event input = Wire.event(lease.get("input_payload").toString(), true);
    int attempts = ((Number) lease.get("attempts")).intValue();
    LOG.info(
        "processing_started eventId={} assetId={} correlationId={} attempt={}",
        input.eventId(),
        input.assetId(),
        input.correlationId(),
        attempts);
    if (attempts > 3) {
      finish(lease, input, "RETRY_EXHAUSTED");
      return;
    }
    try {
      String error = sandbox.inspect(objects.get(input.objectKey()));
      finish(lease, input, error);
    } catch (Exception transientFailure) {
      if (attempts >= 3) finish(lease, input, "RETRY_EXHAUSTED");
      else {
        checkpoints.retry(lease);
        LOG.warn(
            "retry_scheduled eventId={} assetId={} correlationId={} attempt={}"
                + " reason=OBJECT_UNAVAILABLE",
            input.eventId(),
            input.assetId(),
            input.correlationId(),
            attempts);
      }
    }
  }

  private void finish(Map<String, Object> lease, Wire.Event input, String error) {
    boolean saved = checkpoints.finish(lease, Wire.outcome(input, error));
    if (saved) {
      LOG.info(
          "outcome_saved eventId={} assetId={} correlationId={} status={} errorCode={}",
          input.eventId(),
          input.assetId(),
          input.correlationId(),
          error == null ? "COMPLETED" : "FAILED",
          error == null ? "NONE" : Wire.ERRORS.contains(error) ? error : "PROCESSING_ERROR");
    } else {
      LOG.warn(
          "outcome_not_saved eventId={} assetId={} correlationId={} reason=STALE_FENCE",
          input.eventId(),
          input.assetId(),
          input.correlationId());
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
        LOG.info(
            "outcome_published eventId={} assetId={} correlationId={} attempt={}",
            row.get("event_id"),
            row.get("asset_id"),
            row.get("correlation_id"),
            row.get("publication_attempts"));
      } catch (Exception failure) {
        checkpoints.db.update(
            "UPDATE checkpoint SET"
                + " last_error='BROKER_UNAVAILABLE',publish_after=now()+((power(2,publication_attempts-1))::text||'"
                + " seconds')::interval WHERE event_id=?::uuid",
            row.get("event_id").toString());
        int attempts = ((Number) row.get("publication_attempts")).intValue();
        LOG.warn(
            "{} eventId={} assetId={} correlationId={} attempt={} reason=BROKER_UNAVAILABLE",
            attempts >= 3 ? "publication_exhausted" : "publication_retry_scheduled",
            row.get("event_id"),
            row.get("asset_id"),
            row.get("correlation_id"),
            attempts);
      }
    }
  }
}
