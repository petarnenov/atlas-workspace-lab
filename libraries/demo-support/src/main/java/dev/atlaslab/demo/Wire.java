package dev.atlaslab.demo;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;

/** Public wire DTOs and schema invariants only; no shared domain persistence. */
public final class Wire {
  private Wire() {}

  public static final ObjectMapper JSON =
      new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);
  public static final Set<String> ERRORS =
      Set.of("INVALID_DOCUMENT", "PROCESSING_ERROR", "RETRY_EXHAUSTED");

  public record Receipt(String assetId, String status, String correlationId) {}

  public record Detail(
      String assetId,
      String status,
      long version,
      String createdAt,
      String updatedAt,
      String errorCode) {}

  public record Event(
      String eventId,
      String assetId,
      String tenantId,
      String schemaVersion,
      String occurredAt,
      String correlationId,
      String objectKey,
      String outcome,
      String errorCode) {}

  public static String json(Object value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid JSON", e);
    }
  }

  public static Event event(String raw, boolean upload) {
    try {
      JsonNode node = JSON.readTree(raw);
      Set<String> allowed =
          new HashSet<>(
              Set.of(
                  "eventId",
                  "assetId",
                  "tenantId",
                  "schemaVersion",
                  "occurredAt",
                  "correlationId"));
      allowed.addAll(upload ? Set.of("objectKey") : Set.of("outcome", "errorCode"));
      if (!node.isObject()) throw new IllegalArgumentException();
      for (Iterator<String> it = node.fieldNames(); it.hasNext(); )
        if (!allowed.contains(it.next())) throw new IllegalArgumentException();
      for (String key : List.of("eventId", "assetId", "tenantId", "correlationId")) {
        if (!node.path(key).isTextual()) throw new IllegalArgumentException();
        uuid(node.path(key).asText());
      }
      if (!node.path("schemaVersion").isTextual()
          || !node.path("schemaVersion").asText().equals("1")) throw new IllegalArgumentException();
      Instant.parse(node.path("occurredAt").asText());
      if (!Identity.TENANTS.contains(node.path("tenantId").asText()))
        throw new IllegalArgumentException();
      if (upload) {
        if (!node.path("objectKey").isTextual() || node.path("objectKey").asText().isBlank())
          throw new IllegalArgumentException();
      } else {
        if (!Set.of("COMPLETED", "FAILED").contains(node.path("outcome").asText()))
          throw new IllegalArgumentException();
        if (node.has("errorCode") && !ERRORS.contains(node.path("errorCode").asText()))
          throw new IllegalArgumentException();
      }
      return JSON.treeToValue(node, Event.class);
    } catch (Exception e) {
      throw new IllegalArgumentException("Invalid event envelope", e);
    }
  }

  public static String uuid(String value) {
    if (value == null || !UUID.fromString(value).toString().equalsIgnoreCase(value))
      throw new IllegalArgumentException("Invalid UUID");
    return value.toLowerCase(Locale.ROOT);
  }

  public static Event uploaded(String asset, String tenant, String correlation, String key) {
    return new Event(
        UUID.randomUUID().toString(),
        asset,
        tenant,
        "1",
        Instant.now().toString(),
        correlation,
        key,
        null,
        null);
  }

  public static Event outcome(Event input, String error) {
    return new Event(
        UUID.randomUUID().toString(),
        input.assetId(),
        input.tenantId(),
        "1",
        Instant.now().toString(),
        input.correlationId(),
        null,
        error == null ? "COMPLETED" : "FAILED",
        error);
  }
  public record ProcessedV2(String eventId,String assetId,String tenantId,String schemaVersion,
      String occurredAt,String correlationId,String inputEventId,String outcome,String errorCode,String artifactId) {}
  public static ProcessedV2 processedV2(String raw) {
    try {
      var node=JSON.readTree(raw);
      if(!node.isObject()||!node.path("schemaVersion").isTextual()||!"2".equals(node.path("schemaVersion").asText()))throw new IllegalArgumentException();
      uuid(node.path("inputEventId").asText());
      boolean completed="COMPLETED".equals(node.path("outcome").asText());
      if(completed) {
        uuid(node.path("artifactId").asText());
        if(node.has("errorCode"))throw new IllegalArgumentException();
      } else if(node.has("artifactId")||!node.path("errorCode").isTextual())throw new IllegalArgumentException();
      var old=((com.fasterxml.jackson.databind.node.ObjectNode)node.deepCopy());
      old.remove("inputEventId");old.remove("artifactId");old.put("schemaVersion","1");
      event(JSON.writeValueAsString(old),false);
      return JSON.treeToValue(node,ProcessedV2.class);
    } catch(Exception invalid) { throw new IllegalArgumentException("Invalid processed v2 envelope"); }
  }
  public static ProcessedV2 processedV2(Event input,String artifactId,String error) {
    return new ProcessedV2(UUID.randomUUID().toString(),input.assetId(),input.tenantId(),"2",Instant.now().toString(),
      input.correlationId(),input.eventId(),error==null?"COMPLETED":"FAILED",error,artifactId);
  }

}
