package dev.atlaslab.assets.adapters.in;

import dev.atlaslab.assets.application.ParsedArtifacts;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import dev.atlaslab.demo.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="lab.artifacts.enabled",havingValue="true")
public class ArtifactHttp {
  private final ParsedArtifacts artifacts;
  private final Identity writer,reader;
  public ArtifactHttp(ParsedArtifacts artifacts,@Value("${lab.identity.worker-public-key}") String workerKey,
      @Value("${lab.identity.public-key}") String serviceKey) {
    this.artifacts=artifacts;
    writer=new Identity(workerKey,"lab-worker","asset-artifact-write",60);
    reader=new Identity(serviceKey,"lab-bff","asset-artifact-read",60);
  }
  @PostMapping("/internal/v1/assets/{assetId}/parsed-stages")
  public ResponseEntity<?> stage(@RequestHeader(value="Authorization",required=false) String auth,
      @RequestHeader("Idempotency-Key") String key,@PathVariable String assetId,HttpServletRequest request) throws Exception {
    var who=writer.verify(auth);
    if(!"processing-worker".equals(who.subject()))throw new HttpFailure(403,"DENIED","Denied workload");
    if(!"application/json".equals(request.getContentType()))throw new HttpFailure(400,"BAD_REQUEST","Expected JSON");
    byte[] bytes=request.getInputStream().readNBytes(10*1024*1024+1);
    if(bytes.length>10*1024*1024)throw new Failure(Failure.Kind.TOO_LARGE);
    var node=Wire.JSON.readTree(bytes);
    Set<String> fields=Set.of("inputEventId","correlationId","sourceSha256","attemptFence","pageCount","document","provenance","native");
    if(!node.isObject())throw new IllegalArgumentException();
    for(var names=node.fieldNames();names.hasNext();)if(!fields.contains(names.next()))throw new IllegalArgumentException();
    var document=node.path("document");var provenance=node.path("provenance");
    if(!node.path("inputEventId").isTextual()||!node.path("correlationId").isTextual()||!node.path("sourceSha256").isTextual()
      ||!node.path("attemptFence").isIntegralNumber()||!node.path("attemptFence").canConvertToLong()
      ||!node.path("pageCount").isIntegralNumber()||!node.path("pageCount").canConvertToInt()
      ||!document.isObject()||document.size()!=2||!document.path("schemaVersion").isTextual()||!"1".equals(document.path("schemaVersion").asText())||!document.path("markdown").isTextual()
      ||!provenance.isObject()||provenance.size()!=2||!provenance.path("converter").isTextual()||!provenance.path("pipeline").isTextual())throw new IllegalArgumentException();
    String nativeJson=null;
    if(node.has("native")) {
      var nativeArtifact=node.get("native");
      if(!nativeArtifact.isObject()||nativeArtifact.size()!=2||!"application/json".equals(nativeArtifact.path("mediaType").asText())||!nativeArtifact.path("content").isObject())throw new IllegalArgumentException();
      nativeJson=Wire.json(nativeArtifact.get("content"));
    }
    var stage=new Stage(who.tenant(),Wire.uuid(assetId),node.path("inputEventId").asText(),node.path("correlationId").asText(),node.path("sourceSha256").asText(),node.path("attemptFence").asLong(),Wire.uuid(key),
      new Document(document.path("markdown").asText(),nativeJson,provenance.path("converter").asText(),provenance.path("pipeline").asText(),node.path("pageCount").asInt()));
    var result=artifacts.stage(stage,PdfUpload.digest(bytes));
    return ResponseEntity.status(result.created()?201:200).body(Map.of("artifactId",result.artifactId()));
  }
  @GetMapping({"/internal/v1/assets/{assetId}/parsed","/internal/v2/assets/{assetId}/parsed"})
  public ResponseEntity<?> read(@RequestHeader(value="Authorization",required=false) String auth,
      @PathVariable String assetId,@RequestParam(defaultValue="markdown") String format,HttpServletRequest request) {
    var who=reader.verify(auth);
    if(!Set.of("markdown","json").contains(format))throw new HttpFailure(400,"BAD_FORMAT","Invalid format");
    boolean neutral=request.getRequestURI().startsWith("/internal/v2/");
    String content=artifacts.read(who.tenant(),Wire.uuid(assetId),format,neutral);
    Object body=neutral&&format.equals("json")?Map.of("schemaVersion","1","markdown",content):content;
    return ResponseEntity.ok().header("Cache-Control","no-store")
      .header("Content-Type",format.equals("markdown")?"text/markdown; charset=utf-8":"application/json").body(body);
  }
}
