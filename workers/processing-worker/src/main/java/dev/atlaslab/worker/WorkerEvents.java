package dev.atlaslab.worker;

import dev.atlaslab.demo.Wire;
import dev.atlaslab.worker.application.ProcessingKernel;
import dev.atlaslab.worker.domain.WorkModel.Work;
import org.slf4j.*;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;

/** Thin event and scheduler adapter. */
public class WorkerEvents {
  private static final Logger LOG=LoggerFactory.getLogger(WorkerEvents.class);
  private final ProcessingKernel kernel;
  public WorkerEvents(ProcessingKernel kernel) { this.kernel=kernel; }
  @KafkaListener(topics="asset.uploaded.v1")
  public void receive(String raw) {
    LOG.info("input_received");
    final Wire.Event event;
    try { event=Wire.event(raw,true); }
    catch(IllegalArgumentException invalid) { kernel.invalidInput();return; }
    kernel.accept(new Work(event.eventId(),event.assetId(),event.tenantId(),event.correlationId(),event.objectKey(),event.occurredAt()));
  }
  @Scheduled(fixedDelayString="${lab.worker-delay:500}")
  public void process() { kernel.process(); }
  @Scheduled(fixedDelayString="${lab.publisher-delay:500}")
  public void publish() { kernel.publish(); }
}
