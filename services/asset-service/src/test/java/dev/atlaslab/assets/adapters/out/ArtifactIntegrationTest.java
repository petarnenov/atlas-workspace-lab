package dev.atlaslab.assets.adapters.out;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import dev.atlaslab.assets.*;
import dev.atlaslab.assets.application.*;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import dev.atlaslab.assets.domain.AssetModel.Actor;
import dev.atlaslab.assets.domain.AssetModel.Outcome;
import dev.atlaslab.assets.ports.SourceStore;
import dev.atlaslab.demo.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

@Tag("integration")
class ArtifactIntegrationTest {
 JdbcTemplate db;JdbcAssets persistence;JdbcArtifacts catalog;Assets assets;
 S3Artifacts store;ParsedArtifacts artifacts;Actor actor;String event,asset,correlation;
 final byte[] pdf="%PDF-1.7 synthetic artifact".getBytes();
 @BeforeEach void setup() {
  var ds=new DriverManagerDataSource(System.getenv().getOrDefault("ASSET_DB_URL","jdbc:postgresql://localhost:5432/assets"),"asset_owner",System.getenv("LAB_ASSET_DB_PASSWORD"));
  new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(ds);db=new JdbcTemplate(ds);
  db.execute("TRUNCATE outcome_seen,asset_finding,upload_outbox,asset,upload_intent RESTART IDENTITY CASCADE");
  persistence=new JdbcAssets(db,new DataSourceTransactionManager(ds));catalog=new JdbcArtifacts(db,persistence);
  assets=new Assets(persistence,mock(SourceStore.class));actor=new Actor(UUID.randomUUID().toString(),"fixture");
  var uploaded=assets.upload(actor,UUID.randomUUID().toString(),"a.pdf","application/pdf",pdf);asset=uploaded.assetId();correlation=uploaded.correlationId();
  event=db.queryForObject("SELECT event_id::text FROM upload_outbox WHERE asset_id=?::uuid",String.class,asset);
  persistence.claimDispatch(event);
  store=new S3Artifacts(System.getenv().getOrDefault("LAB_OBJECT_ENDPOINT","http://localhost:9000"),System.getenv("LAB_ARTIFACT_OBJECT_PASSWORD"));
  artifacts=new ParsedArtifacts(catalog,store);
 }
 @AfterEach void close() { if(store!=null)store.close(); }
 Stage stage() {return new Stage(actor.tenant(),asset,event,correlation,PdfUpload.digest(pdf),1,UUID.randomUUID().toString(),new Document("Saved synthetic text","{\"opaque\":true}","alternate","plain",1));}
 @Test void realStoreAndTransactionsHideStagesThenAtomicallyCommitDedupAndPublicState() {
  var input=stage();var saved=artifacts.stage(input,"a".repeat(64));
  assertThrows(Failure.class,()->artifacts.read(actor.tenant(),asset,"markdown",true));
  assertFalse(artifacts.stage(input,"a".repeat(64)).created());
  assertEquals(1,catalog.pendingCount(actor.tenant()));assertEquals("STAGED",catalog.byId(actor.tenant(),asset,saved.artifactId()).status());
  var outcome=new Outcome(UUID.randomUUID().toString(),asset,actor.tenant(),correlation,"COMPLETED",null,event,saved.artifactId());
  var completion=new CompleteAsset(assets,artifacts);completion.accept(outcome,"b".repeat(64));completion.accept(outcome,"b".repeat(64));
  assertEquals("COMPLETED",assets.read(actor,asset).status());assertEquals(1,db.queryForObject("SELECT count(*) FROM outcome_seen",Integer.class));
  assertEquals(0,catalog.pendingCount(actor.tenant()));assertEquals("Saved synthetic text",artifacts.read(actor.tenant(),asset,"json",true));assertEquals("{\"opaque\":true}",artifacts.read(actor.tenant(),asset,"json",false));
  assertThrows(Failure.class,()->artifacts.read(UUID.randomUUID().toString(),asset,"markdown",true));
  assertThrows(Failure.class,()->store.putIfAbsent(new Ref(actor.tenant(),saved.artifactId(),"markdown"),"changed".getBytes(),"text/markdown"));
  assertEquals("Saved synthetic text",artifacts.read(actor.tenant(),asset,"markdown",true));
 }
 @Test void missingOrUnstagedContentCannotCommitAndSourceScopeMustMatch() {
  var input=stage();var saved=artifacts.stage(input,"a".repeat(64));
  db.update("UPDATE derived_artifact SET state='WRITING' WHERE artifact_id=?::uuid",saved.artifactId());
  var outcome=new Outcome(UUID.randomUUID().toString(),asset,actor.tenant(),correlation,"COMPLETED",null,event,saved.artifactId());
  assertThrows(Failure.class,()->new CompleteAsset(assets,artifacts).accept(outcome,"b".repeat(64)));
  assertEquals("PROCESSING",assets.read(actor,asset).status());assertEquals(0,db.queryForObject("SELECT count(*) FROM outcome_seen",Integer.class));
  // Lost stage acknowledgement resumes the exact immutable content and reserved manifest.
  assertEquals(saved.artifactId(),artifacts.stage(input,"a".repeat(64)).artifactId());
  assertThrows(Failure.class,()->artifacts.stage(new Stage(UUID.randomUUID().toString(),asset,event,correlation,PdfUpload.digest(pdf),1,UUID.randomUUID().toString(),input.document()),"c".repeat(64)));
 }
 @org.junit.jupiter.api.io.TempDir java.nio.file.Path directory;
 Map<String,String> maintenanceEnv() {
  var env=new HashMap<>(System.getenv());env.put("ENV","dev");env.put("ATLAS_MAINTENANCE_PAUSED","1");return env;
 }
 @Test void explicitLegacyMigrationPreservesBytesRepeatsAndExportsRollbackCopies() throws Exception {
  assets.outcome(new Outcome(UUID.randomUUID().toString(),asset,actor.tenant(),correlation,"COMPLETED",null),"b".repeat(64));
  persistence.dispatched(event);
  String nativeJson="{ \"opaque\": true }\n";
  var copy=new dev.atlaslab.demo.adapters.out.MaintenanceFiles.Copy(actor.tenant(),asset,event,correlation,PdfUpload.digest(pdf),"old-converter","old-pipeline",1,1,null,"Original saved text",nativeJson,dev.atlaslab.demo.adapters.out.MaintenanceFiles.hash("Original saved text"),dev.atlaslab.demo.adapters.out.MaintenanceFiles.hash(nativeJson));
  var input=directory.resolve("worker.json");dev.atlaslab.demo.adapters.out.MaintenanceFiles.write(input,"worker-copies",List.of(copy));
  var env=maintenanceEnv();
  for(int i=0;i<2;i++)dev.atlaslab.assets.bootstrap.AssetMaintenance.run(new String[]{"import",input.toString()},env);
  assertEquals(1,db.queryForObject("SELECT count(*) FROM derived_artifact",Integer.class));
  assertEquals(nativeJson,artifacts.read(actor.tenant(),asset,"json",false));
  var export=directory.resolve("asset.json");dev.atlaslab.assets.bootstrap.AssetMaintenance.run(new String[]{"export",export.toString()},env);
  var rows=dev.atlaslab.demo.adapters.out.MaintenanceFiles.read(export,"asset-copies");
  assertEquals(nativeJson,dev.atlaslab.demo.adapters.out.MaintenanceFiles.copy(rows.get(0)).nativeJson());
  assertEquals(1,rows.size());
  dev.atlaslab.assets.bootstrap.AssetMaintenance.run(new String[]{"snapshot",directory.resolve("snapshot.json").toString()},env);
  var missingPause=new HashMap<>(env);missingPause.remove("ATLAS_MAINTENANCE_PAUSED");
  assertThrows(IllegalStateException.class,()->dev.atlaslab.assets.bootstrap.AssetMaintenance.run(new String[]{"export","unused"},missingPause));
  assertThrows(IllegalArgumentException.class,()->dev.atlaslab.assets.bootstrap.AssetMaintenance.run(new String[]{"unknown","unused"},env));
 }
 @Test void realCredentialsSeparateSourcesDerivedWritesAndMaintenanceDeletion() throws Exception {
  var ref=new Ref(actor.tenant(),UUID.randomUUID().toString(),"markdown");store.putIfAbsent(ref,"synthetic".getBytes(),"text/markdown");
  for(String user:List.of("asset_artifacts","worker_reader","asset_store")) {
   String secret=System.getenv(user.equals("asset_artifacts")?"LAB_ARTIFACT_OBJECT_PASSWORD":user.equals("worker_reader")?"LAB_WORKER_OBJECT_PASSWORD":"LAB_ASSET_OBJECT_PASSWORD");
   try(var client=software.amazon.awssdk.services.s3.S3Client.builder().endpointOverride(java.net.URI.create(System.getenv().getOrDefault("LAB_OBJECT_ENDPOINT","http://localhost:9000"))).region(software.amazon.awssdk.regions.Region.US_EAST_1).credentialsProvider(software.amazon.awssdk.auth.credentials.StaticCredentialsProvider.create(software.amazon.awssdk.auth.credentials.AwsBasicCredentials.create(user,secret))).serviceConfiguration(software.amazon.awssdk.services.s3.S3Configuration.builder().pathStyleAccessEnabled(true).build()).httpClientBuilder(software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient.builder()).build()) {
    String key=ref.tenant()+"/"+ref.artifactId()+"/markdown";
    if(user.equals("asset_artifacts")) {
     assertEquals(403,assertThrows(software.amazon.awssdk.services.s3.model.S3Exception.class,client::listBuckets).statusCode());
     assertEquals(403,assertThrows(software.amazon.awssdk.services.s3.model.S3Exception.class,()->client.deleteObject(b->b.bucket("synthetic-derived").key(key))).statusCode());
     assertEquals(403,assertThrows(software.amazon.awssdk.services.s3.model.S3Exception.class,()->client.putObject(b->b.bucket("synthetic-assets").key(UUID.randomUUID()+".pdf"),software.amazon.awssdk.core.sync.RequestBody.fromString("denied"))).statusCode());
    } else assertEquals(403,assertThrows(software.amazon.awssdk.services.s3.model.S3Exception.class,()->client.getObject(b->b.bucket("synthetic-derived").key(key))).statusCode());
   }
  }
 }
}
