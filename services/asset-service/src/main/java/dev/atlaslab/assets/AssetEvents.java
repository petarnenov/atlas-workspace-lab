package dev.atlaslab.assets;

import dev.atlaslab.assets.application.AssetDelivery;
import dev.atlaslab.assets.domain.AssetModel.Outcome;
import dev.atlaslab.assets.ports.AssetPersistence;
import dev.atlaslab.demo.*;
import java.nio.charset.StandardCharsets;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Transport and scheduling only; decisions live in application use cases. */
@Component
public class AssetEvents {
  private final Assets assets;
  private final AssetDelivery delivery;
  private final AssetPersistence persistence;
  public AssetEvents(Assets assets,AssetDelivery delivery,AssetPersistence persistence) {
    this.assets=assets;this.delivery=delivery;this.persistence=persistence;
  }
  @KafkaListener(topics="asset.processed.v1")
  public void receive(String raw) {
    final Wire.Event event;
    try { event=Wire.event(raw,false); }
    catch(IllegalArgumentException invalid) { persistence.finding(null,"INVALID_EVENT");return; }
    assets.outcome(new Outcome(event.eventId(),event.assetId(),event.tenantId(),event.correlationId(),
      event.outcome(),event.errorCode()),PdfUpload.digest(raw.getBytes(StandardCharsets.UTF_8)));
  }
  @Scheduled(fixedDelayString="${lab.dispatch-delay:1000}")
  public void dispatch() { delivery.dispatch(); }
  @Scheduled(fixedDelayString="${lab.reconcile-delay:60000}")
  public void reconcile() { delivery.reconcile(); }
}
