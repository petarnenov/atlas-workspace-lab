package dev.atlaslab.assets.application;
import static org.junit.jupiter.api.Assertions.*;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import dev.atlaslab.assets.ports.*;
import dev.atlaslab.demo.PdfUpload;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.*;

class ParsedArtifactsTest {
  static final String TENANT="11111111-1111-4111-8111-111111111111";
  final String asset=UUID.randomUUID().toString(),input=UUID.randomUUID().toString(),correlation=UUID.randomUUID().toString(),key=UUID.randomUUID().toString();
  MemoryContent content;MemoryCatalog catalog;ParsedArtifacts application;Stage stage;
  @BeforeEach void setup() {
    content=new MemoryContent();catalog=new MemoryCatalog();application=new ParsedArtifacts(catalog,content);
    stage=new Stage(TENANT,asset,input,correlation,"a".repeat(64),1,key,new Document("synthetic","{\"opaque\":true}","fixture","pipeline",1));
    catalog.binding=new Binding(stage.sourceHash(),correlation,input,"PROCESSING");
  }
  @Test void stagedIsHiddenAndRetriesHaveOneImmutableIdentity() {
    var first=application.stage(stage,"payload-hash");
    assertTrue(first.created());assertEquals(2,content.values.size());
    assertThrows(Failure.class,()->application.read(TENANT,asset,"markdown",true));
    var retried=application.stage(stage,"payload-hash");
    assertFalse(retried.created());assertEquals(first.artifactId(),retried.artifactId());
    assertEquals(2,content.writes);
    assertThrows(Failure.class,()->application.stage(stage,"different-payload"));
    application.verifyOutcome(TENANT,asset,first.artifactId(),input,correlation);
    catalog.commit();
    assertEquals("synthetic",application.read(TENANT,asset,"markdown",true));
    assertEquals("synthetic",application.read(TENANT,asset,"json",true));
    assertEquals("{\"opaque\":true}",application.read(TENANT,asset,"json",false));
    assertThrows(Failure.class,()->application.read(UUID.randomUUID().toString(),asset,"markdown",true));
    assertThrows(Failure.class,()->application.read(TENANT,UUID.randomUUID().toString(),"markdown",true));
  }
  @Test void partialWriteAndLostAcknowledgementResumeWithoutOverwriting() {
    content.failNative=true;
    assertThrows(Failure.class,()->application.stage(stage,"payload-hash"));
    String reserved=catalog.manifest.artifactId();
    assertEquals("WRITING",catalog.manifest.status());assertEquals(1,content.values.size());
    var resumed=application.stage(stage,"payload-hash");
    assertEquals(reserved,resumed.artifactId());assertEquals("STAGED",catalog.manifest.status());
    assertEquals(2,content.values.size());
    assertThrows(Failure.class,()->application.verifyOutcome(TENANT,asset,reserved,UUID.randomUUID().toString(),correlation));
    assertThrows(Failure.class,()->application.verifyOutcome(TENANT,asset,reserved,input,UUID.randomUUID().toString()));
  }
  @Test void integrityAndUnknownReferencesFailClosed() {
    var saved=application.stage(stage,"payload-hash");
    Ref markdown=new Ref(TENANT,saved.artifactId(),"markdown");
    content.values.put(markdown,"corrupt".getBytes());
    assertEquals(Failure.Kind.UNAVAILABLE,assertThrows(Failure.class,()->application.verifyOutcome(TENANT,asset,saved.artifactId(),input,correlation)).kind);
    catalog.commit();
    assertThrows(Failure.class,()->application.read(TENANT,asset,"markdown",true));
    content.values.remove(markdown);
    assertThrows(Failure.class,()->application.read(TENANT,asset,"markdown",true));
    assertThrows(Failure.class,()->application.verifyOutcome(TENANT,asset,UUID.randomUUID().toString(),input,correlation));
  }
  @Test void tenantSourceAndInputBindingAreVerifiedBeforeContentWrites() {
    for(var binding:Arrays.asList(null,new Binding("b".repeat(64),correlation,input,"PROCESSING"),
      new Binding(stage.sourceHash(),UUID.randomUUID().toString(),input,"PROCESSING"),
      new Binding(stage.sourceHash(),correlation,UUID.randomUUID().toString(),"PROCESSING"),
      new Binding(stage.sourceHash(),correlation,input,"COMPLETED"))) {
      catalog.binding=binding;
      assertThrows(Failure.class,()->application.stage(stage,"payload-hash"));
      assertTrue(content.values.isEmpty());assertNull(catalog.manifest);
    }
  }
  @Test void neutralOnlyParserDoesNotNeedNativeOutputAndQuotaBackpressures() {
    stage=new Stage(TENANT,asset,input,correlation,stage.sourceHash(),1,key,new Document("portable",null,"alternate","alternate",1));
    catalog.count=100;
    assertEquals(Failure.Kind.UNAVAILABLE,assertThrows(Failure.class,()->application.stage(stage,"payload-hash")).kind);
    assertTrue(content.values.isEmpty());catalog.count=0;
    var saved=application.stage(stage,"payload-hash");assertEquals(1,content.values.size());
    application.verifyOutcome(TENANT,asset,saved.artifactId(),input,correlation);catalog.commit();
    assertEquals("portable",application.read(TENANT,asset,"json",true));
    assertEquals(Failure.Kind.NOT_FOUND,assertThrows(Failure.class,()->application.read(TENANT,asset,"json",false)).kind);
  }
  @Test void malformedDocumentsAndLimitsCannotReserveOrWrite() {
    for(var document:List.of(new Document(" ",null,"fixture","pipeline",1),new Document("x",null,"fixture","pipeline",21),
      new Document("x",null,"","pipeline",1),new Document("x",null,"fixture","x".repeat(129),1),
      new Document("x".repeat(10*1024*1024+1),null,"fixture","pipeline",1))) {
      var invalid=new Stage(TENANT,asset,input,correlation,stage.sourceHash(),1,key,document);
      assertThrows(Failure.class,()->application.stage(invalid,"payload-hash"));
    }
    assertNull(catalog.manifest);assertTrue(content.values.isEmpty());
    assertThrows(RuntimeException.class,()->application.stage(new Stage("invalid",asset,input,correlation,stage.sourceHash(),1,key,stage.document()),"payload-hash"));
  }
  static final class MemoryContent implements ArtifactStore {
    final Map<Ref,byte[]> values=new HashMap<>();int writes;boolean failNative;
    public void putIfAbsent(Ref ref,byte[] bytes,String type) {
      if(failNative&&ref.variant().equals("native")) { failNative=false;throw new Failure(Failure.Kind.UNAVAILABLE); }
      byte[] old=values.putIfAbsent(ref,bytes.clone());
      if(old!=null&&!Arrays.equals(old,bytes))throw new Failure(Failure.Kind.CONFLICT);
      writes++;
    }
    public byte[] read(Ref ref) {
      byte[] bytes=values.get(ref);if(bytes==null)throw new Failure(Failure.Kind.UNAVAILABLE);return bytes.clone();
    }
  }
  static final class MemoryCatalog implements ArtifactCatalog {
    Binding binding;Manifest manifest;int count;
    public <T> T withStagingOwnership(String tenant,Supplier<T> operation) { return operation.get(); }
    public Binding binding(String tenant,String asset) { return binding; }
    public Manifest byKey(String tenant,String key) { return manifest!=null&&manifest.stage().tenant().equals(tenant)&&manifest.stage().key().equals(key)?manifest:null; }
    public Manifest byId(String tenant,String asset,String artifact) { return manifest!=null&&manifest.stage().tenant().equals(tenant)&&manifest.stage().assetId().equals(asset)&&manifest.artifactId().equals(artifact)?manifest:null; }
    public Manifest committed(String tenant,String asset) { return manifest!=null&&manifest.status().equals("COMMITTED")&&manifest.stage().tenant().equals(tenant)&&manifest.stage().assetId().equals(asset)?manifest:null; }
    public int pendingCount(String tenant) { return count; }
    public void reserve(Manifest manifest) { this.manifest=manifest; }
    public void staged(String tenant,String artifact) { state("STAGED"); }
    void commit() { state("COMMITTED"); }
    void state(String state) { manifest=new Manifest(manifest.artifactId(),manifest.stage(),manifest.payloadHash(),manifest.markdownHash(),manifest.nativeHash(),state); }
  }
}
