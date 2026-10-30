package dev.atlaslab.assets;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import dev.atlaslab.demo.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.kafka.core.KafkaTemplate;

@Tag("integration")
class AssetApplicationTest {
  JdbcTemplate db;
  Assets assets;
  ObjectsStore store;
  KafkaTemplate<String, String> kafka;
  AssetEvents events;
  Identity.Context who =
      new Identity.Context("11111111-1111-4111-8111-111111111111", "synthetic-user");
  byte[] pdf = "%PDF-1.7 synthetic fixture".getBytes();

  @BeforeEach
  @SuppressWarnings("unchecked")
  void setup() {
    var ds =
        new DriverManagerDataSource(
            "jdbc:postgresql://localhost:5432/assets",
            "asset_owner",
            System.getenv("LAB_ASSET_DB_PASSWORD"));
    new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(ds);
    db = new JdbcTemplate(ds);
    db.execute(
        "TRUNCATE outcome_seen,asset_finding,upload_outbox,asset,upload_intent RESTART IDENTITY"
            + " CASCADE");
    store = mock(ObjectsStore.class);
    assets = new Assets(db, new DataSourceTransactionManager(ds), store);
    kafka = mock(KafkaTemplate.class);
    events = new AssetEvents(assets, kafka);
    when(kafka.send(anyString(), anyString(), anyString()))
        .thenReturn(CompletableFuture.completedFuture(null));
  }

  Wire.Receipt upload(String key) {
    return assets.upload(who, key, "../arbitrary.pdf", "application/pdf", pdf);
  }

  @Test
  void acceptedReplayScopeAndImmutableTerminalState() throws Exception {
    var receipt = upload("same");
    assertEquals("PENDING", receipt.status());
    assertEquals(receipt, upload("same"));
    verify(store, times(1)).put(anyString(), any());
    assertEquals(1, db.queryForObject("SELECT count(*) FROM upload_outbox", Integer.class));
    assertEquals(0, assets.read(who, receipt.assetId()).version());
    var tenantB = new Identity.Context("22222222-2222-4222-8222-222222222222", "synthetic-user");
    assertEquals(
        404, assertThrows(HttpFailure.class, () -> assets.read(tenantB, receipt.assetId())).status);
    assertEquals(
        404,
        assertThrows(HttpFailure.class, () -> assets.read(who, UUID.randomUUID().toString()))
            .status);
    assertEquals(
        400,
        assertThrows(
                HttpFailure.class,
                () ->
                    assets.upload(
                        who, "same", "a.pdf", "application/pdf", "%PDF-1.7 different".getBytes()))
            .status);
    events.dispatch();
    assertEquals("PROCESSING", assets.read(who, receipt.assetId()).status());
    var input =
        Wire.event(db.queryForObject("SELECT payload FROM upload_outbox", String.class), true);
    var output = Wire.outcome(input, null);
    events.receive(Wire.json(output));
    events.receive(Wire.json(output));
    assertEquals("COMPLETED", assets.read(who, receipt.assetId()).status());
    assertEquals(2, assets.read(who, receipt.assetId()).version());
    events.receive(Wire.json(Wire.outcome(input, "PROCESSING_ERROR")));
    assertEquals("COMPLETED", assets.read(who, receipt.assetId()).status());
    events.dispatch();
    verify(kafka, times(1)).send(eq("asset.uploaded.v1"), eq(receipt.assetId()), anyString());
    assertEquals(receipt, upload("same"));
    assertTrue(db.queryForObject("SELECT count(*) FROM asset_finding", Integer.class) > 0);
    assertNotEquals(
        receipt.assetId(),
        assets.upload(tenantB, "same", "b.pdf", "application/pdf", pdf).assetId());
  }

  @Test
  void permanentValidationAndStorageFailuresPublishNothing() throws Exception {
    assertThrows(HttpFailure.class, () -> assets.upload(who, "", "x.pdf", "application/pdf", pdf));
    assertThrows(
        HttpFailure.class,
        () -> assets.upload(who, "x".repeat(129), "x.pdf", "application/pdf", pdf));
    assertThrows(
        HttpFailure.class, () -> assets.upload(who, null, "x.txt", "application/pdf", pdf));
    doThrow(new RuntimeException("private dependency details")).when(store).put(anyString(), any());
    HttpFailure failure = assertThrows(HttpFailure.class, () -> upload("storage-fail"));
    assertEquals(503, failure.status);
    assertFalse(failure.getMessage().contains("private"));
    assertEquals(0, db.queryForObject("SELECT count(*) FROM asset", Integer.class));
    assertEquals(0, db.queryForObject("SELECT count(*) FROM upload_outbox", Integer.class));
    verify(store).delete(anyString());
  }

  @Test
  void compensationFailureRetainsRecoverableIntent() throws Exception {
    doThrow(new RuntimeException()).when(store).put(anyString(), any());
    doThrow(new RuntimeException()).when(store).delete(anyString());
    assertThrows(HttpFailure.class, () -> upload("recover"));
    String id = db.queryForObject("SELECT asset_id::text FROM upload_intent", String.class);
    reset(store);
    assertEquals(id, upload("recover").assetId());
    assertEquals(1, db.queryForObject("SELECT count(*) FROM asset", Integer.class));
  }

  @Test
  void expiredKeysAndUnkeyedUploadsCreateDistinctAssets() {
    String first = upload("expires").assetId();
    db.update("UPDATE upload_intent SET expires_at=now()-interval '1 second'");
    assertNotEquals(first, upload("expires").assetId());
    assertNotEquals(upload(null).assetId(), upload(null).assetId());
  }

  @Test
  void brokerFailureRetainedAndStuckProcessingReconciled() {
    var r = upload("broker");
    when(kafka.send(anyString(), anyString(), anyString()))
        .thenReturn(CompletableFuture.failedFuture(new RuntimeException()));
    for (int i = 0; i < 5; i++) {
      db.update("UPDATE upload_outbox SET next_at=now()-interval '1 second'");
      events.dispatch();
    }
    assertEquals(3, db.queryForObject("SELECT attempts FROM upload_outbox", Integer.class));
    assertFalse(db.queryForObject("SELECT sent FROM upload_outbox", Boolean.class));
    db.update("UPDATE asset SET updated_at=now()-interval '16 minutes'");
    events.reconcile();
    assertEquals("FAILED", assets.read(who, r.assetId()).status());
    assertEquals("RETRY_EXHAUSTED", assets.read(who, r.assetId()).errorCode());
    var e = Wire.event(db.queryForObject("SELECT payload FROM upload_outbox", String.class), true);
    events.receive(Wire.json(Wire.outcome(e, null)));
    assertEquals("FAILED", assets.read(who, r.assetId()).status());
  }

  @Test
  void invalidWrongScopeUnknownAndOutOfOrderOutcomesAreQuarantined() {
    var r = upload("scope");
    var input =
        Wire.event(db.queryForObject("SELECT payload FROM upload_outbox", String.class), true);
    events.receive("bad JSON");
    var e = Wire.outcome(input, null);
    String raw = Wire.json(e);
    events.receive(raw.replace(e.assetId(), UUID.randomUUID().toString()));
    events.receive(raw.replace(e.tenantId(), "22222222-2222-4222-8222-222222222222"));
    events.receive(raw.replace(e.correlationId(), UUID.randomUUID().toString()));
    events.receive(raw);
    assertEquals("PENDING", assets.read(who, r.assetId()).status());
    events.dispatch();
    var valid = Wire.outcome(input, null);
    events.receive(Wire.json(valid));
    events.receive(Wire.json(valid).replace("COMPLETED", "FAILED"));
    assertEquals("COMPLETED", assets.read(who, r.assetId()).status());
    assertTrue(db.queryForObject("SELECT count(*) FROM asset_finding", Integer.class) >= 5);
  }

  @Test
  void abandonedIntentCleanupAndReciprocalDatabaseDenial() throws Exception {
    doThrow(new RuntimeException()).when(store).put(anyString(), any());
    doThrow(new RuntimeException()).when(store).delete(anyString());
    assertThrows(HttpFailure.class, () -> upload("abandoned"));
    reset(store);
    db.update("UPDATE upload_intent SET created_at=now()-interval '11 minutes'");
    events.reconcile();
    assertEquals(0, db.queryForObject("SELECT count(*) FROM upload_intent", Integer.class));
    var denied =
        new DriverManagerDataSource(
            "jdbc:postgresql://localhost:5432/worker_checkpoint",
            "asset_owner",
            System.getenv("LAB_ASSET_DB_PASSWORD"));
    assertThrows(Exception.class, denied::getConnection);
  }

  @Test
  void concurrentReplayUsesOneObjectAndReceipt() throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(3);
    try {
      var futures =
          pool.invokeAll(
              List.<Callable<Wire.Receipt>>of(
                  () -> upload("parallel"), () -> upload("parallel"), () -> upload("parallel")));
      String id = futures.getFirst().get().assetId();
      for (var f : futures) assertEquals(id, f.get().assetId());
      verify(store, times(1)).put(anyString(), any());
    } finally {
      pool.shutdownNow();
    }
  }
}
