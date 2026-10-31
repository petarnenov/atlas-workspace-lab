package dev.atlaslab.workspace.adapters.out;
import dev.atlaslab.workspace.domain.WorkspaceModel.*;
import dev.atlaslab.workspace.ports.AssetGateway;
import dev.atlaslab.demo.*;
import dev.atlaslab.demo.adapters.out.BoundedRead;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

public final class HttpAssetGateway implements AssetGateway {
  private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  private final String key,assets,worker;
  private final boolean portable,legacyFallback;
  public HttpAssetGateway(String key,String assets,String worker,boolean portable,boolean legacyFallback) {
    this.key=key;this.assets=assets;this.worker=worker;this.portable=portable;this.legacyFallback=legacyFallback;
  }
  private HttpRequest.Builder request(String base,String path,Actor who,String audience) {
    return HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(10))
      .header("Authorization","Bearer "+Identity.issue(new Identity.Context(who.tenant(),who.subject()),key,"lab-bff",audience,60));
  }
  public Reply upload(Actor who,String key,byte[] bytes) throws Exception {
    String boundary="lab-"+UUID.randomUUID();
    var body=new ByteArrayOutputStream();
    body.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"synthetic.pdf\"\r\nContent-Type: application/pdf\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
    body.write(bytes);body.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.US_ASCII));
    var request=request(assets,"/internal/v1/assets",who,"asset-service").header("Content-Type","multipart/form-data; boundary="+boundary);
    if(key!=null)request.header("Idempotency-Key",key);
    return send(request.POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build(),false);
  }
  public Reply asset(Actor who,String id) throws Exception {
    return send(request(assets,"/internal/v1/assets/"+id,who,"asset-service").GET().build(),false);
  }
  public Reply parsed(Actor who,String id,String format,boolean neutral) throws Exception {
    boolean markdown=format.equals("markdown");
    if(neutral||portable) {
      Reply result=send(request(assets,"/internal/"+(neutral?"v2":"v1")+"/assets/"+id+"/parsed?format="+format,who,"asset-artifact-read").GET().build(),markdown);
      if(neutral||result.code()!=Code.MISSING||!legacyFallback)return result;
    }
    return send(request(worker,"/internal/v1/assets/"+id+"/parsed?format="+format,who,"worker-parsed-read").GET().build(),markdown);
  }
  private Reply send(HttpRequest request,boolean markdown) throws Exception {
    var response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());
    try(var stream=response.body()) {
      Code code=switch(response.statusCode()) {
        case 200->Code.OK;case 202->Code.ACCEPTED;case 400->Code.INVALID;case 401->Code.UNAUTHENTICATED;
        case 403->Code.DENIED;case 404->Code.MISSING;case 413->Code.TOO_LARGE;case 415->Code.UNSUPPORTED;case 503->Code.UNAVAILABLE;
        default->throw new HttpFailure(503,"UNAVAILABLE","Asset service unavailable");
      };
      byte[] bytes=BoundedRead.read(stream,10*1024*1024,Duration.ofSeconds(10));
      return new Reply(code,new String(bytes,StandardCharsets.UTF_8),markdown&&code==Code.OK);
    }
  }
}
