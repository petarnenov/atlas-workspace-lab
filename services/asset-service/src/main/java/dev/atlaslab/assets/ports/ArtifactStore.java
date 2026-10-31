package dev.atlaslab.assets.ports;
import dev.atlaslab.assets.domain.ArtifactModel.Ref;
/** Immutable content only. Normal application bindings have no deletion capability. */
public interface ArtifactStore {
  void putIfAbsent(Ref reference,byte[] bytes,String mediaType);
  byte[] read(Ref reference);
}
