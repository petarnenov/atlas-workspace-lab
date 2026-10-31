package dev.atlaslab.assets.domain;

public final class AssetModel {
  private AssetModel() {}
  public record Actor(String tenant,String subject) {}
  public record Receipt(String assetId,String status,String correlationId) {}
  public record Detail(String assetId,String status,long version,String createdAt,String updatedAt,String errorCode) {}
  public record Intent(String assetId,String tenant,String subject,String key,String digest,
      String objectKey,String correlationId,String lockScope,boolean committed) {
    public Receipt receipt() { return new Receipt(assetId,"PENDING",correlationId); }
  }
  public record Outcome(String eventId,String assetId,String tenantId,String correlationId,
      String status,String errorCode,String inputEventId,String artifactId) {
    public Outcome(String eventId,String assetId,String tenantId,String correlationId,String status,String errorCode) {
      this(eventId,assetId,tenantId,correlationId,status,errorCode,null,null);
    }
  }
  public record State(String tenantId,String correlationId,String status) {}
  public record Dispatch(String eventId,String assetId,String payload) {}
  public enum Decision { APPLY, UNKNOWN_ASSET, SCOPE_MISMATCH, TERMINAL_OR_OUT_OF_ORDER }
  public static final class Failure extends RuntimeException {
    public enum Kind { INVALID_KEY, KEY_REUSED, NOT_FOUND, UNAVAILABLE }
    public final Kind kind;
    public Failure(Kind kind) { super(kind.name());this.kind=kind; }
  }
}
