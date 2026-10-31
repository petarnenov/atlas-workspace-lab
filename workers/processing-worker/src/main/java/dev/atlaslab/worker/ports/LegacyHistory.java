package dev.atlaslab.worker.ports;
import java.util.List;
/** Worker-owned migration capability, never exposed to another service's SQL. */
public interface LegacyHistory {
 record Copy(String tenantId,String assetId,String inputEventId,String correlationId,String sourceSha256,
     String converter,String pipeline,int pageCount,long fence,String artifactId,String markdown,String nativeJson) {}
 boolean drained();
 List<Copy> exportBatch(int maximum);
 void restore(Copy copy);
}
