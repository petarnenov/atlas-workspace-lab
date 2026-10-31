package dev.atlaslab.assets.ports;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import java.util.function.Supplier;
public interface ArtifactCatalog {
  <T> T withStagingOwnership(String tenant,Supplier<T> operation);
  Binding binding(String tenant,String assetId);
  Manifest byKey(String tenant,String key);
  Manifest byId(String tenant,String assetId,String artifactId);
  Manifest committed(String tenant,String assetId);
  int pendingCount(String tenant);
  void reserve(Manifest manifest);
  void staged(String tenant,String artifactId);
}
