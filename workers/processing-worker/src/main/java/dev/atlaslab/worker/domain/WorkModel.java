package dev.atlaslab.worker.domain;

public final class WorkModel {
  private WorkModel() {}
  public record Work(String eventId,String assetId,String tenantId,String correlationId,String reference,String occurredAt) {}
  public record Lease(Work work,int attempt,long fence,String stageKey) {}
  public record Parsed(String hash,String version,String pipeline,int pages,String markdown,String nativeJson) {}
  public record Publication(String eventId,String assetId,String correlationId,int attempt,String payload) {}
}
