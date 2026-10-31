package dev.atlaslab.worker.adapters.out;

import dev.atlaslab.worker.domain.WorkModel.*;
import dev.atlaslab.worker.ports.ProcessingPorts.Completion;
import dev.atlaslab.worker.ports.ProcessingPorts.DocumentParser.Rejected;
import dev.atlaslab.demo.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

/** Stage immutable asset-owned content, then fence the local outcome transaction. */
public final class ArtifactCompletionClient implements Completion {
  private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  private final String base,signingKey;
  private final JdbcExecutionState state;
  public ArtifactCompletionClient(String base,String signingKey,JdbcExecutionState state) {
    this.base=base;this.signingKey=signingKey;this.state=state;
  }
  public boolean commit(Lease lease,Parsed parsed) throws Exception {
    var work=lease.work();
    var body=new LinkedHashMap<String,Object>();
    body.put("inputEventId",work.eventId());body.put("correlationId",work.correlationId());
    body.put("sourceSha256",parsed.hash());body.put("attemptFence",lease.fence());body.put("pageCount",parsed.pages());
    body.put("document",Map.of("schemaVersion","1","markdown",parsed.markdown()));
    body.put("provenance",Map.of("converter",parsed.version(),"pipeline",parsed.pipeline()));
    if(parsed.nativeJson()!=null)body.put("native",Map.of("mediaType","application/json","content",Wire.JSON.readTree(parsed.nativeJson())));
    byte[] bytes=Wire.JSON.writeValueAsBytes(body);
    if(bytes.length>10*1024*1024)throw new Rejected();
    String token=Identity.issue(new Identity.Context(work.tenantId(),"processing-worker"),signingKey,"lab-worker","asset-artifact-write",60);
    var request=HttpRequest.newBuilder(URI.create(base+"/internal/v1/assets/"+Wire.uuid(work.assetId())+"/parsed-stages"))
      .timeout(Duration.ofSeconds(45)).header("Content-Type","application/json")
      .header("Authorization","Bearer "+token).header("Idempotency-Key",lease.stageKey()).POST(HttpRequest.BodyPublishers.ofByteArray(bytes)).build();
    var response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());
    try(var stream=response.body()) {
      if(Set.of(400,403,404,409,413,422).contains(response.statusCode()))throw new Rejected();
      if(!Set.of(200,201).contains(response.statusCode()))throw new java.io.IOException("ARTIFACT_UNAVAILABLE");
      byte[] reply=dev.atlaslab.demo.adapters.out.BoundedRead.read(stream,4096,Duration.ofSeconds(5));
      if(reply.length>4096)throw new java.io.IOException("ARTIFACT_UNAVAILABLE");
      var node=Wire.JSON.readTree(reply);
      if(!node.isObject()||node.size()!=1||!node.path("artifactId").isTextual())throw new java.io.IOException("ARTIFACT_UNAVAILABLE");
      return state.completeReference(lease,Wire.uuid(node.path("artifactId").asText()));
    }
  }
}
