package dev.atlaslab.demo.adapters.out;
import dev.atlaslab.demo.*;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.*;

/** Local, versioned operator exchange codec; no service data access. */
public final class MaintenanceFiles {
 private static final long MAX_BYTES=100L*1024*1024;
 private MaintenanceFiles() {}
 public static void write(Path file,String owner,List<?> rows) throws Exception {
  if(rows.size()>1000)throw new IllegalArgumentException("Maintenance batch exceeds 1000");
  byte[] data=Wire.JSON.writeValueAsBytes(Map.of("schemaVersion","1","owner",owner,"rows",rows));
  if(data.length>MAX_BYTES)throw new IllegalArgumentException("Maintenance file exceeds 100 MiB");
  Files.createDirectories(file.toAbsolutePath().getParent());
  // Never overwrite a reviewed snapshot or export. Explicit new paths make reruns auditable.
  Files.createFile(file,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
  Files.write(file,data);
 }
 public static JsonNode read(Path file,String owner) throws Exception {
  if(Files.size(file)>MAX_BYTES)throw new IllegalArgumentException("Maintenance file exceeds 100 MiB");
  var data=Wire.JSON.readTree(Files.readAllBytes(file));
  if(!data.isObject()||data.size()!=3||!data.path("schemaVersion").isTextual()||!data.path("schemaVersion").asText().equals("1")
    ||!data.path("owner").asText().equals(owner)||!data.path("rows").isArray()||data.path("rows").size()>1000)throw new IllegalArgumentException("Invalid maintenance exchange");
  return data.get("rows");
 }
 public record Copy(String tenantId,String assetId,String inputEventId,String correlationId,String sourceSha256,
     String converter,String pipeline,int pageCount,long fence,String artifactId,String markdown,String nativeJson,
     String markdownSha256,String nativeSha256) {}
 public static Copy copy(JsonNode node) throws Exception {
  Copy copy=Wire.JSON.treeToValue(node,Copy.class);
  for(String value:new String[]{copy.tenantId(),copy.assetId(),copy.inputEventId(),copy.correlationId()})Wire.uuid(value);
  if(copy.artifactId()!=null)Wire.uuid(copy.artifactId());
  if(copy.fence()<1||copy.pageCount()<1||copy.pageCount()>20||copy.converter()==null||copy.converter().isBlank()||copy.converter().length()>128
    ||copy.pipeline()==null||copy.pipeline().isBlank()||copy.pipeline().length()>128||copy.markdown()==null||copy.markdown().isBlank()
    ||copy.sourceSha256()==null||!copy.sourceSha256().matches("[a-f0-9]{64}"))throw new IllegalArgumentException("Invalid migrated copy");
  byte[] markdown=copy.markdown().getBytes(java.nio.charset.StandardCharsets.UTF_8);
  byte[] nativeBytes=copy.nativeJson()==null?new byte[0]:copy.nativeJson().getBytes(java.nio.charset.StandardCharsets.UTF_8);
  if(markdown.length+nativeBytes.length>10*1024*1024||!PdfUpload.digest(markdown).equals(copy.markdownSha256())
    ||(copy.nativeJson()==null?copy.nativeSha256()!=null:!PdfUpload.digest(nativeBytes).equals(copy.nativeSha256())))throw new IllegalArgumentException("Migrated checksum mismatch");
  if(copy.nativeJson()!=null&&!Wire.JSON.readTree(copy.nativeJson()).isObject())throw new IllegalArgumentException("Invalid native artifact");
  return copy;
 }
 public static String hash(String text) { return text==null?null:PdfUpload.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
}
