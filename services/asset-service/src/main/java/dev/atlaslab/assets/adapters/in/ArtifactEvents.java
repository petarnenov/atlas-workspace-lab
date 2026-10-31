package dev.atlaslab.assets.adapters.in;
import dev.atlaslab.assets.Assets;
import dev.atlaslab.assets.application.ParsedArtifacts;
import dev.atlaslab.assets.domain.AssetModel.Outcome;
import dev.atlaslab.assets.ports.AssetPersistence;
import dev.atlaslab.demo.*;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="lab.artifacts.enabled",havingValue="true")
public class ArtifactEvents {
  private final dev.atlaslab.assets.application.CompleteAsset completion;
  private final AssetPersistence persistence;
  public ArtifactEvents(dev.atlaslab.assets.application.CompleteAsset completion,AssetPersistence persistence) {
    this.completion=completion;this.persistence=persistence;
  }
  @KafkaListener(topics="asset.processed.v2")
  public void receive(String raw) {
    final Wire.ProcessedV2 event;
    try { event=Wire.processedV2(raw); }
    catch(IllegalArgumentException invalid) { persistence.finding(null,"INVALID_EVENT");return; }
    completion.accept(new Outcome(event.eventId(),event.assetId(),event.tenantId(),event.correlationId(),event.outcome(),event.errorCode(),event.inputEventId(),event.artifactId()),PdfUpload.digest(raw.getBytes(StandardCharsets.UTF_8)));
  }
}
