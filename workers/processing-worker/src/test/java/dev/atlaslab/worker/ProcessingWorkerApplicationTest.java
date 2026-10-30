package dev.atlaslab.worker;

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
class ProcessingWorkerApplicationTest {
  JdbcTemplate db;
  Checkpoints checkpoints;
  ObjectsStore store;
  Sandbox sandbox;
  KafkaTemplate<String, String> kafka;
  WorkerEvents events;

  @BeforeEach
  @SuppressWarnings("unchecked")
  void setup() {
    var ds =
        new DriverManagerDataSource(
            "jdbc:postgresql://localhost:5432/worker_checkpoint",
            "worker_owner",
            System.getenv("LAB_WORKER_DB_PASSWORD"));
    new ResourceDatabasePopulator(new ClassPathResource("schema.sql")).execute(ds);
    db = new JdbcTemplate(ds);
    db.execute("TRUNCATE checkpoint,worker_finding RESTART IDENTITY");
    checkpoints = new Checkpoints(db, new DataSourceTransactionManager(ds));
    store = mock(ObjectsStore.class);
    sandbox = mock(Sandbox.class);
    kafka = mock(KafkaTemplate.class);
    events = new WorkerEvents(checkpoints, store, sandbox, kafka);
    when(kafka.send(anyString(), anyString(), anyString()))
        .thenReturn(CompletableFuture.completedFuture(null));
  }

  Wire.Event input() {
    return Wire.uploaded(
        UUID.randomUUID().toString(),
        "11111111-1111-4111-8111-111111111111",
        UUID.randomUUID().toString(),
        UUID.randomUUID() + ".pdf");
  }

  @Test
  void durableInputAndOutcomeSurviveRecreationAndDuplicatePublication() throws Exception {
    Wire.Event e = input();
    events.receive(Wire.json(e));
    events.receive(Wire.json(e));
    assertEquals(1, db.queryForObject("SELECT count(*) FROM checkpoint", Integer.class));
    // New repository/scanner instances simulate loss of all in-memory processing state.
    var restarted = new Checkpoints(db, new DataSourceTransactionManager(db.getDataSource()));
    var worker = new WorkerEvents(restarted, store, sandbox, kafka);
    when(store.get(e.objectKey())).thenReturn("synthetic".getBytes());
    worker.process();
    String outcome = db.queryForObject("SELECT outcome FROM checkpoint", String.class);
    assertNotNull(outcome);
    assertEquals("COMPLETED", Wire.event(outcome, false).outcome());
    worker.publish();
    db.update("UPDATE checkpoint SET sent=false,publish_after=now()-interval '1 second'");
    worker.publish();
    verify(kafka, times(2)).send(eq("asset.processed.v1"), eq(e.assetId()), eq(outcome));
    worker.process();
    verify(sandbox, times(1)).inspect(any());
  }

  @Test
  void conflictingAndMalformedInputsAreQuarantined() {
    Wire.Event e = input();
    events.receive(Wire.json(e));
    events.receive(Wire.json(e).replace(e.objectKey(), UUID.randomUUID() + ".pdf"));
    events.receive(
        Wire.json(e)
            .replace(e.eventId(), UUID.randomUUID().toString())
            .replace(e.correlationId(), UUID.randomUUID().toString()));
    events.receive("{}");
    events.receive(Wire.json(input()).replaceAll("[a-f0-9-]{36}\\.pdf", "../../secret"));
    assertEquals(1, db.queryForObject("SELECT count(*) FROM checkpoint", Integer.class));
    assertEquals(4, db.queryForObject("SELECT count(*) FROM worker_finding", Integer.class));
  }

  @Test
  void expiredLeaseCanBeRecoveredButStaleFenceCannotWrite() {
    Wire.Event e = input();
    events.receive(Wire.json(e));
    var stale = checkpoints.claim();
    assertNull(checkpoints.claim());
    db.update("UPDATE checkpoint SET lease_until=now()-interval '1 second'");
    var newer = checkpoints.claim();
    assertFalse(checkpoints.finish(stale, Wire.outcome(e, null)));
    assertTrue(checkpoints.finish(newer, Wire.outcome(e, null)));
    assertFalse(checkpoints.finish(newer, Wire.outcome(e, "PROCESSING_ERROR")));
    assertNull(checkpoints.claim());
  }

  @Test
  void transientRetryIsBoundedAndPermanentFailureHasNoRetry() throws Exception {
    Wire.Event e = input();
    events.receive(Wire.json(e));
    when(store.get(e.objectKey())).thenThrow(new RuntimeException());
    for (int i = 0; i < 4; i++) {
      db.update("UPDATE checkpoint SET next_at=now()-interval '1 second'");
      events.process();
    }
    assertEquals(3, db.queryForObject("SELECT attempts FROM checkpoint", Integer.class));
    assertEquals(
        "RETRY_EXHAUSTED",
        Wire.event(db.queryForObject("SELECT outcome FROM checkpoint", String.class), false)
            .errorCode());
    db.execute("TRUNCATE checkpoint");
    e = input();
    events.receive(Wire.json(e));
    when(store.get(e.objectKey())).thenReturn(new byte[] {1});
    when(sandbox.inspect(any())).thenReturn("INVALID_DOCUMENT");
    events.process();
    events.process();
    assertEquals(1, db.queryForObject("SELECT attempts FROM checkpoint", Integer.class));
    assertEquals(
        "INVALID_DOCUMENT",
        Wire.event(db.queryForObject("SELECT outcome FROM checkpoint", String.class), false)
            .errorCode());
  }

  @Test
  void exhaustedCrashLeaseAndBrokerPublicationRemainInspectable() {
    Wire.Event e = input();
    events.receive(Wire.json(e));
    db.update("UPDATE checkpoint SET attempts=3");
    events.process();
    assertEquals(
        "RETRY_EXHAUSTED",
        Wire.event(db.queryForObject("SELECT outcome FROM checkpoint", String.class), false)
            .errorCode());
    when(kafka.send(anyString(), anyString(), anyString()))
        .thenReturn(CompletableFuture.failedFuture(new RuntimeException()));
    for (int i = 0; i < 4; i++) {
      db.update("UPDATE checkpoint SET publish_after=now()-interval '1 second'");
      events.publish();
    }
    assertEquals(
        3, db.queryForObject("SELECT publication_attempts FROM checkpoint", Integer.class));
    assertFalse(db.queryForObject("SELECT sent FROM checkpoint", Boolean.class));
    assertEquals(
        "BROKER_UNAVAILABLE", db.queryForObject("SELECT last_error FROM checkpoint", String.class));
  }

  @Test
  void databasePrivilegeBoundary() {
    var denied =
        new DriverManagerDataSource(
            "jdbc:postgresql://localhost:5432/assets",
            "worker_owner",
            System.getenv("LAB_WORKER_DB_PASSWORD"));
    assertThrows(Exception.class, denied::getConnection);
  }
}
