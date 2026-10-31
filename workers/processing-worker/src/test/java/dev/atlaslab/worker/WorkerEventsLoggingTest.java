package dev.atlaslab.worker;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import dev.atlaslab.demo.ObjectsStore;
import dev.atlaslab.demo.Wire;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.*;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.PlatformTransactionManager;

class WorkerEventsLoggingTest {
  static final String SENSITIVE = "private-token\nforged-log https://private.invalid/document";
  final Wire.Event input =
      Wire.uploaded(
          UUID.randomUUID().toString(),
          "11111111-1111-4111-8111-111111111111",
          UUID.randomUUID().toString(),
          "private-object.pdf");
  JdbcTemplate db;
  Checkpoints checkpoints;
  ObjectsStore objects;
  Sandbox sandbox;
  KafkaTemplate<String, String> kafka;
  WorkerEvents worker;
  Logger logger;
  Level previousLevel;
  boolean previousAdditive;
  ListAppender<ILoggingEvent> appender;

  @BeforeEach
  @SuppressWarnings("unchecked")
  void setup() {
    db = mock(JdbcTemplate.class);
    checkpoints = spy(new Checkpoints(db, mock(PlatformTransactionManager.class)));
    objects = mock(ObjectsStore.class);
    sandbox = mock(Sandbox.class);
    kafka = mock(KafkaTemplate.class);
    worker = new WorkerEvents(checkpoints, objects, sandbox, mock(ParserClient.class), kafka);
    logger = (Logger) LoggerFactory.getLogger(WorkerEvents.class);
    previousLevel = logger.getLevel();
    previousAdditive = logger.isAdditive();
    logger.setLevel(Level.INFO);
    logger.setAdditive(false);
    appender = new ListAppender<>();
    appender.start();
    logger.addAppender(appender);
  }

  @AfterEach
  void restoreLoggerAndVerifyNoSensitiveData() {
    try {
      for (ILoggingEvent log : appender.list) {
        assertNull(log.getThrowableProxy());
        for (String forbidden : List.of("private-token", "forged-log", "private.invalid"))
          assertFalse(log.getFormattedMessage().contains(forbidden));
        assertFalse(log.getFormattedMessage().contains(input.tenantId()));
        assertFalse(log.getFormattedMessage().contains(input.objectKey()));
      }
    } finally {
      logger.detachAppender(appender);
      appender.stop();
      logger.setLevel(previousLevel);
      logger.setAdditive(previousAdditive);
    }
  }

  Map<String, Object> lease(int attempt) {
    Map<String, Object> result = Map.of("input_payload", Wire.json(input), "attempts", attempt);
    doReturn(result).when(checkpoints).claim();
    return result;
  }

  List<String> messages() {
    return appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
  }

  void assertMessage(String prefix, Level level) {
    ILoggingEvent log =
        appender.list.stream()
            .filter(e -> e.getFormattedMessage().startsWith(prefix))
            .findFirst()
            .orElseThrow();
    assertEquals(level, log.getLevel());
    assertTrue(log.getFormattedMessage().contains("eventId=" + input.eventId()));
    assertTrue(log.getFormattedMessage().contains("assetId=" + input.assetId()));
    assertTrue(log.getFormattedMessage().contains("correlationId=" + input.correlationId()));
  }

  @Test
  void receiptContainsNoUnvalidatedPayloadAndIdlePollIsSilent() {
    doNothing().when(checkpoints).accept(anyString());
    worker.receive(SENSITIVE);
    verify(checkpoints).accept(SENSITIVE);
    assertEquals(List.of("input_received"), messages());
    appender.list.clear();
    doReturn(null).when(checkpoints).claim();
    when(db.queryForList(anyString())).thenReturn(List.of());
    worker.process();
    worker.publish();
    assertTrue(messages().isEmpty());
  }

  @Test
  void successfulProcessingLogsOnlyAfterFencedSave() throws Exception {
    var lease = lease(1);
    when(objects.get(input.objectKey())).thenReturn(new byte[] {1});
    doAnswer(
            invocation -> {
              assertFalse(messages().stream().anyMatch(s -> s.startsWith("outcome_saved")));
              return true;
            })
        .when(checkpoints)
        .finishParsed(eq(lease), eq(input), any());
    worker.process();
    assertMessage("processing_started", Level.INFO);
    assertMessage("outcome_saved", Level.INFO);
    assertTrue(messages().getLast().contains("status=COMPLETED errorCode=NONE"));
    verify(checkpoints).finishParsed(eq(lease), eq(input), any());
  }

  @Test
  void rejectedFenceNeverClaimsSavedOutcome() {
    var lease = lease(1);
    doReturn(false).when(checkpoints).finishParsed(eq(lease), eq(input), any());
    worker.process();
    assertMessage("outcome_not_saved", Level.WARN);
    assertFalse(messages().stream().anyMatch(s -> s.startsWith("outcome_saved")));
  }

  @Test
  void transientFailureSchedulesRetryWithoutExceptionDetails() throws Exception {
    var lease = lease(1);
    doThrow(new IllegalStateException(SENSITIVE)).when(objects).get(input.objectKey());
    doNothing().when(checkpoints).retry(lease);
    worker.process();
    verify(checkpoints).retry(lease);
    assertMessage("retry_scheduled", Level.WARN);
    assertTrue(messages().getLast().contains("attempt=1 reason=DEPENDENCY_UNAVAILABLE"));
    verify(checkpoints, never()).finish(any(), any());
  }

  @Test
  void thirdAttemptAndRecoveredExhaustedLeaseSaveFailure() throws Exception {
    for (int attempt : List.of(3, 4)) {
      var lease = lease(attempt);
      doThrow(new IllegalStateException(SENSITIVE)).when(objects).get(input.objectKey());
      doReturn(true).when(checkpoints).finish(eq(lease), any());
      appender.list.clear();
      worker.process();
      assertMessage("outcome_saved", Level.INFO);
      assertTrue(messages().getLast().contains("status=FAILED errorCode=RETRY_EXHAUSTED"));
      verify(checkpoints).finish(eq(lease), argThat(e -> "RETRY_EXHAUSTED".equals(e.errorCode())));
      verify(checkpoints, never()).retry(lease);
    }
  }

  @Test
  void permanentFailureAndUnexpectedParserCodeNeverExposeArbitraryText() throws Exception {
    var lease = lease(1);
    doReturn(true).when(checkpoints).finish(eq(lease), any());
    for (String code : List.of("INVALID_DOCUMENT", SENSITIVE)) {
      when(sandbox.inspect(any())).thenReturn(code);
      appender.list.clear();
      worker.process();
      assertTrue(
          messages()
              .getLast()
              .contains("errorCode=" + (Wire.ERRORS.contains(code) ? code : "PROCESSING_ERROR")));
      verify(checkpoints, never()).retry(any());
    }
  }

  void publication(int attempt) {
    var row =
        Map.<String, Object>of(
            "event_id",
            input.eventId(),
            "asset_id",
            input.assetId(),
            "correlation_id",
            input.correlationId(),
            "outcome",
            SENSITIVE,
            "publication_attempts",
            attempt);
    when(db.queryForList(startsWith("SELECT"))).thenReturn(List.of(row));
    when(db.queryForList(startsWith("UPDATE"), anyString())).thenReturn(List.of(row));
  }

  @Test
  void publicationSuccessRequiresAcknowledgementAndStateUpdate() {
    publication(1);
    when(kafka.send(anyString(), anyString(), anyString()))
        .thenReturn(CompletableFuture.completedFuture(null));
    when(db.update(startsWith("UPDATE checkpoint SET sent=true"), anyString()))
        .thenAnswer(
            invocation -> {
              assertFalse(messages().stream().anyMatch(s -> s.startsWith("outcome_published")));
              return 1;
            });
    worker.publish();
    assertMessage("outcome_published", Level.INFO);
    verify(kafka).send("asset.processed.v1", input.assetId(), SENSITIVE);
  }

  @Test
  void brokerFailureReportsRetryThenExhaustionWithoutExceptionOrPayload() {
    for (int attempt : List.of(1, 3)) {
      publication(attempt);
      when(kafka.send(anyString(), anyString(), anyString()))
          .thenReturn(CompletableFuture.failedFuture(new IllegalStateException(SENSITIVE)));
      appender.list.clear();
      worker.publish();
      assertMessage(
          attempt == 3 ? "publication_exhausted" : "publication_retry_scheduled", Level.WARN);
      assertTrue(messages().getLast().contains("reason=BROKER_UNAVAILABLE"));
      assertFalse(messages().stream().anyMatch(s -> s.startsWith("outcome_published")));
      verify(db, never()).update(startsWith("UPDATE checkpoint SET sent=true"), anyString());
    }
  }

  @Test
  void lostPublicationRaceIsSilent() {
    publication(1);
    when(db.queryForList(startsWith("UPDATE"), anyString())).thenReturn(List.of());
    worker.publish();
    assertTrue(messages().isEmpty());
    verifyNoInteractions(kafka);
  }

  @Test
  void failedSentStateUpdateNeverClaimsPublishedOutcome() {
    publication(1);
    when(kafka.send(anyString(), anyString(), anyString()))
        .thenReturn(CompletableFuture.completedFuture(null));
    when(db.update(startsWith("UPDATE checkpoint SET sent=true"), anyString()))
        .thenThrow(new IllegalStateException(SENSITIVE));
    worker.publish();
    assertMessage("publication_retry_scheduled", Level.WARN);
    assertFalse(messages().stream().anyMatch(s -> s.startsWith("outcome_published")));
    verify(db)
        .update(startsWith("UPDATE checkpoint SET last_error='BROKER_UNAVAILABLE'"), anyString());
  }

  @Test
  void invalidStoredEnvelopeCannotInjectProcessingLogs() {
    doReturn(Map.of("input_payload", SENSITIVE, "attempts", 1)).when(checkpoints).claim();
    assertThrows(IllegalArgumentException.class, worker::process);
    assertTrue(messages().isEmpty());
  }

  @Test
  void lostLeaseCancelsParsingAndCannotPublishOrSave() throws Exception {
    var lease = lease(1);
    var parser = mock(ParserClient.class);
    var events = new WorkerEvents(checkpoints, objects, sandbox, parser, kafka);
    events.renewalMillis = 20;
    when(objects.get(input.objectKey())).thenReturn(new byte[] {1});
    when(parser.parse(any()))
        .thenAnswer(
            invocation -> {
              Thread.sleep(1000);
              return null;
            });
    doReturn(false).when(checkpoints).renew(lease);
    events.process();
    assertFalse(Thread.currentThread().isInterrupted());
    verify(checkpoints, never()).finishParsed(any(), any(), any());
    verify(checkpoints, never()).finish(any(), any());
    verify(checkpoints, never()).retry(any());
  }

  @Test
  void parserPermanentFailureSkipsRetriesAndInvalidPdfSkipsParser() throws Exception {
    var lease = lease(1);
    var parser = mock(ParserClient.class);
    var events = new WorkerEvents(checkpoints, objects, sandbox, parser, kafka);
    when(objects.get(input.objectKey())).thenReturn(new byte[] {1});
    when(parser.parse(any())).thenThrow(new ParserClient.Rejected());
    doReturn(true).when(checkpoints).finish(eq(lease), any());
    events.process();
    verify(checkpoints).finish(eq(lease), argThat(e -> "PROCESSING_ERROR".equals(e.errorCode())));
    verify(checkpoints, never()).retry(any());
    clearInvocations(parser);
    when(sandbox.inspect(any())).thenReturn("INVALID_DOCUMENT");
    events.process();
    verifyNoInteractions(parser);
  }
}
