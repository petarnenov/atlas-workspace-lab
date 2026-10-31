package dev.atlaslab.worker.adapters.out;
import dev.atlaslab.worker.domain.WorkModel.Publication;
import dev.atlaslab.worker.ports.ProcessingPorts.Publisher;
import dev.atlaslab.demo.Wire;
import java.util.concurrent.TimeUnit;
import org.springframework.kafka.core.KafkaTemplate;
public final class KafkaOutcomePublisher implements Publisher {
  private final KafkaTemplate<String,String> kafka;
  public KafkaOutcomePublisher(KafkaTemplate<String,String> kafka) { this.kafka=kafka; }
  public void publish(Publication publication) throws Exception {
    String version=Wire.JSON.readTree(publication.payload()).path("schemaVersion").asText();
    String topic=switch(version) { case "1"->"asset.processed.v1";case "2"->"asset.processed.v2";default->throw new IllegalArgumentException("Unknown outcome schema"); };
    kafka.send(topic,publication.assetId(),publication.payload()).get(6,TimeUnit.SECONDS);
  }
}
