package dev.atlaslab.assets.ports;
import dev.atlaslab.assets.domain.ArtifactModel.Manifest;
import java.util.List;
/** Explicit operator capability; absent from normal content and controller bindings. */
public interface ArtifactMaintenance {
 void commitImported(Manifest manifest);
 List<Manifest> committedBatch(int maximum);
}
