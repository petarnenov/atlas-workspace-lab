package dev.atlaslab.worker;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import dev.atlaslab.demo.*;
import java.net.*;
import java.nio.file.*;
import java.security.KeyPairGenerator;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

class ParserClientTest {
  @TempDir Path temp;
  HttpServer server;
  ParserClient client;
  byte[] pdf = "%PDF-1.4 synthetic".getBytes();
  Map<String, Object> result;
  int status;

  @BeforeEach
  void setup() throws Exception {
    status = 200;
    result =
        new LinkedHashMap<>(
            Map.of(
                "sourceSha256",
                PdfUpload.digest(pdf),
                "parserVersion",
                "2.145.0",
                "pipelineVersion",
                ParserClient.PIPELINE,
                "pageCount",
                1,
                "markdown",
                "Expected text",
                "document",
                Map.of("schema_name", "DoclingDocument", "version", "1.10.0")));
    Files.writeString(temp.resolve("token"), "a".repeat(48));
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/internal/v1/parse",
        exchange -> {
          assertEquals(
              "Bearer " + "a".repeat(48), exchange.getRequestHeaders().getFirst("Authorization"));
          assertArrayEquals(pdf, exchange.getRequestBody().readAllBytes());
          byte[] body = new ObjectMapper().writeValueAsBytes(result);
          exchange.sendResponseHeaders(status, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    server.start();
    client =
        new ParserClient(
            "http://127.0.0.1:" + server.getAddress().getPort(), temp.resolve("token").toString());
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  @Test
  void returnsValidatedVersionedOutputAndClassifiesHttpFailures() throws Exception {
    var parsed = client.parse(pdf);
    assertEquals("Expected text", parsed.markdown());
    assertEquals(1, parsed.pages());
    for (int failure : List.of(400, 413, 422)) {
      status = failure;
      assertThrows(ParserClient.Rejected.class, () -> client.parse(pdf));
    }
    for (int failure : List.of(401, 429, 503)) {
      status = failure;
      assertThrows(java.io.IOException.class, () -> client.parse(pdf));
    }
    status = 200;
    result.put("markdown", "x".repeat(ParserClient.MAX_OUTPUT + 1));
    assertThrows(ParserClient.Rejected.class, () -> client.parse(pdf));
  }

  @Test
  void rejectsForgedHashUnknownModelInvalidStructureAndOversizedOutput() throws Exception {
    for (var invalid :
        List.of(
            Map.entry("sourceSha256", "0".repeat(64)),
            Map.entry("parserVersion", "unknown"),
            Map.entry("pipelineVersion", "unknown"),
            Map.entry("pageCount", 0),
            Map.entry("pageCount", 21),
            Map.entry("pageCount", "1"),
            Map.entry("markdown", " "),
            Map.entry("markdown", 1),
            Map.entry("document", Map.of("schema_name", "Other", "version", "1.0.0")),
            Map.entry("document", Map.of("schema_name", "DoclingDocument", "version", "2.0.0")),
            Map.entry("document", "bad"))) {
      Object old = result.put(invalid.getKey(), invalid.getValue());
      assertThrows(
          ParserClient.Rejected.class,
          () -> client.validate(pdf, new ObjectMapper().writeValueAsBytes(result)));
      result.put(invalid.getKey(), old);
    }
    assertThrows(ParserClient.Rejected.class, () -> client.validate(pdf, "broken JSON".getBytes()));
    result.put("unexpected", true);
    assertThrows(
        ParserClient.Rejected.class,
        () -> client.validate(pdf, new ObjectMapper().writeValueAsBytes(result)));
  }

  @Test
  void parsedReadUsesVerifiedTenantAndDedicatedAudience() throws Exception {
    var pair = KeyPairGenerator.getInstance("RSA").generateKeyPair();
    var publicKey = temp.resolve("public.pem");
    var privateKey = temp.resolve("private.pem");
    Files.writeString(publicKey, pem("PUBLIC", pair.getPublic().getEncoded()));
    Files.writeString(privateKey, pem("PRIVATE", pair.getPrivate().getEncoded()));
    var db = mock(JdbcTemplate.class);
    var controller = new ParsedHttp(db, publicKey.toString());
    String id = UUID.randomUUID().toString(), tenant = Identity.TENANTS.iterator().next();
    String auth =
        "Bearer "
            + Identity.issue(
                new Identity.Context(tenant, "synthetic"),
                privateKey.toString(),
                "lab-bff",
                "worker-parsed-read",
                60);
    when(db.queryForList(anyString(), eq(tenant), eq(id)))
        .thenReturn(List.of(Map.of("markdown", "Saved", "document", "{\"saved\":true}")));
    assertEquals("Saved", controller.read(auth, id, "markdown").getBody());
    assertEquals("{\"saved\":true}", controller.read(auth, id, "json").getBody());
    assertEquals(
        "no-store", controller.read(auth, id, "json").getHeaders().getFirst("Cache-Control"));
    assertThrows(HttpFailure.class, () -> controller.read(auth, id, "html"));
    assertThrows(HttpFailure.class, () -> controller.read(null, id, "markdown"));
    assertThrows(
        HttpFailure.class,
        () ->
            controller.read(
                "Bearer "
                    + Identity.issue(
                        new Identity.Context(tenant, "synthetic"),
                        privateKey.toString(),
                        "lab-bff",
                        "asset-service",
                        60),
                id,
                "markdown"));
    when(db.queryForList(anyString(), eq(tenant), eq(id))).thenReturn(List.of());
    assertEquals(
        404, assertThrows(HttpFailure.class, () -> controller.read(auth, id, "markdown")).status);
  }

  static String pem(String type, byte[] bytes) {
    return "-----BEGIN "
        + type
        + " KEY-----\n"
        + Base64.getEncoder().encodeToString(bytes)
        + "\n-----END "
        + type
        + " KEY-----";
  }
}
