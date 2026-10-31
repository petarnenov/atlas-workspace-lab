package dev.atlaslab.assets.adapters.in;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import dev.atlaslab.assets.application.ParsedArtifacts;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import dev.atlaslab.demo.*;
import java.nio.file.*;
import java.security.KeyPairGenerator;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;

class ArtifactHttpTest {
 @TempDir Path directory;
 String privateKey,publicKey,writer,reader;
 final String tenant="11111111-1111-4111-8111-111111111111",asset=UUID.randomUUID().toString(),key=UUID.randomUUID().toString();
 ParsedArtifacts artifacts;ArtifactHttp api;
 @BeforeEach void setup() throws Exception {
  var pair=KeyPairGenerator.getInstance("RSA");pair.initialize(2048);var keys=pair.generateKeyPair();
  privateKey=directory.resolve("private.pem").toString();publicKey=directory.resolve("public.pem").toString();
  Files.writeString(Path.of(privateKey),pem("PRIVATE",keys.getPrivate().getEncoded()));Files.writeString(Path.of(publicKey),pem("PUBLIC",keys.getPublic().getEncoded()));
  writer=token("processing-worker","lab-worker","asset-artifact-write");reader=token("bff","lab-bff","asset-artifact-read");
  artifacts=mock(ParsedArtifacts.class);api=new ArtifactHttp(artifacts,publicKey,publicKey);
 }
 String pem(String kind,byte[] data) { return "-----BEGIN "+kind+" KEY-----\n"+Base64.getMimeEncoder(64,new byte[]{10}).encodeToString(data)+"\n-----END "+kind+" KEY-----\n"; }
 String token(String subject,String issuer,String audience) {return "Bearer "+Identity.issue(new Identity.Context(tenant,subject),privateKey,issuer,audience,60);}
 MockHttpServletRequest request(Object data) { var req=new MockHttpServletRequest();req.setContentType("application/json");req.setContent(Wire.json(data).getBytes(java.nio.charset.StandardCharsets.UTF_8));return req; }
 Map<String,Object> body() {
  var data=new LinkedHashMap<String,Object>();data.put("inputEventId",UUID.randomUUID().toString());data.put("correlationId",UUID.randomUUID().toString());data.put("sourceSha256","a".repeat(64));data.put("attemptFence",1);data.put("pageCount",1);data.put("document",Map.of("schemaVersion","1","markdown","Synthetic text"));data.put("provenance",Map.of("converter","alternate","pipeline","plain"));return data;
 }
 @Test void stageAuthenticatesWorkloadAndMapsOnlyNeutralValues() throws Exception {
  when(artifacts.stage(any(),anyString())).thenReturn(new Staged(key,true));
  assertEquals(201,api.stage(writer,key,asset,request(body())).getStatusCode().value());
  var stage=org.mockito.ArgumentCaptor.forClass(Stage.class);verify(artifacts).stage(stage.capture(),matches("[a-f0-9]{64}"));
  assertEquals(tenant,stage.getValue().tenant());assertEquals("alternate",stage.getValue().document().converter());assertNull(stage.getValue().document().nativeJson());
  when(artifacts.stage(any(),anyString())).thenReturn(new Staged(key,false));
  var nativeBody=body();nativeBody.put("native",Map.of("mediaType","application/json","content",Map.of("opaque",true)));
  assertEquals(200,api.stage(writer,key,asset,request(nativeBody)).getStatusCode().value());
  clearInvocations(artifacts);
  for(String denied:new String[]{null,reader,token("other","lab-worker","asset-artifact-write"),token("processing-worker","lab-worker","other")})assertThrows(HttpFailure.class,()->api.stage(denied,key,asset,request(body())));
  verifyNoInteractions(artifacts);
 }
 @Test void malformedPayloadsNeverReachApplication() {
  for(String field:List.of("inputEventId","correlationId","sourceSha256","attemptFence","pageCount","document","provenance")) {
   var bad=body();bad.remove(field);assertThrows(Exception.class,()->api.stage(writer,key,asset,request(bad)));
  }
  var bad=body();bad.put("document",Map.of("schemaVersion",1,"markdown","text"));assertThrows(IllegalArgumentException.class,()->api.stage(writer,key,asset,request(bad)));
  var extra=body();extra.put("extra",true);assertThrows(IllegalArgumentException.class,()->api.stage(writer,key,asset,request(extra)));
  var huge=new MockHttpServletRequest();huge.setContentType("application/json");huge.setContent(new byte[10*1024*1024+1]);assertThrows(Failure.class,()->api.stage(writer,key,asset,huge));
  var wrong=request(body());wrong.setContentType("text/plain");assertThrows(HttpFailure.class,()->api.stage(writer,key,asset,wrong));verifyNoInteractions(artifacts);
 }
 @Test void readsUseVerifiedTenantVersionAndFailClosed() {
  var req=new MockHttpServletRequest();req.setRequestURI("/internal/v2/assets/"+asset+"/parsed");
  when(artifacts.read(tenant,asset,"json",true)).thenReturn("Saved text");
  var result=api.read(reader,asset,"json",req);assertEquals(Map.of("schemaVersion","1","markdown","Saved text"),result.getBody());assertEquals("no-store",result.getHeaders().getFirst("Cache-Control"));
  req.setRequestURI("/internal/v1/assets/"+asset+"/parsed");when(artifacts.read(tenant,asset,"json",false)).thenReturn("{\"native\":true}");assertEquals("{\"native\":true}",api.read(reader,asset,"json",req).getBody());
  assertThrows(HttpFailure.class,()->api.read(writer,asset,"markdown",req));assertThrows(HttpFailure.class,()->api.read(reader,asset,"html",req));
  when(artifacts.read(tenant,asset,"markdown",false)).thenThrow(new Failure(Failure.Kind.UNAVAILABLE));assertThrows(Failure.class,()->api.read(reader,asset,"markdown",req));
  for(var kind:Failure.Kind.values())assertTrue(new AssetFailures().artifact(new Failure(kind)).getStatusCode().isError());
 }
}
