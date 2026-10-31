package dev.atlaslab.assets.domain;

public final class ArtifactModel {
  private ArtifactModel() {}
  public record Ref(String tenant,String artifactId,String variant) {}
  public record Document(String markdown,String nativeJson,String converter,String pipeline,int pages) {}
  public record Stage(String tenant,String assetId,String inputEventId,String correlationId,
      String sourceHash,long fence,String key,Document document) {}
  public record Binding(String sourceHash,String correlationId,String inputEventId,String status) {}
  public record Manifest(String artifactId,Stage stage,String payloadHash,String markdownHash,String nativeHash,String status) {}
  public record Staged(String artifactId,boolean created) {}
  public static final class Failure extends RuntimeException {
    public enum Kind { NOT_FOUND, INVALID, CONFLICT, TOO_LARGE, UNAVAILABLE }
    public final Kind kind;
    public Failure(Kind kind) { super(kind.name());this.kind=kind; }
  }
}
