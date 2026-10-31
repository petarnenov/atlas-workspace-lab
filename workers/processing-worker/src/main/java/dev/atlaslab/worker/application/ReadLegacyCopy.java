package dev.atlaslab.worker.application;
import dev.atlaslab.worker.ports.LegacyCopies;
import java.util.UUID;
public final class ReadLegacyCopy {
  private final LegacyCopies copies;
  public ReadLegacyCopy(LegacyCopies copies) { this.copies=copies; }
  public String read(String tenant,String asset,String format) {
    String id=UUID.fromString(asset).toString();
    if(!id.equalsIgnoreCase(asset))throw new IllegalArgumentException("Invalid UUID");
    return copies.read(tenant,id,format);
  }
}
