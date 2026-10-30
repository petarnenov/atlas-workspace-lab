package dev.atlaslab.workspace;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import dev.atlaslab.demo.*;
import java.net.*;
import java.nio.file.*;
import java.security.KeyPairGenerator;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class WorkspaceApplicationTest {
  @TempDir Path temp;
  HttpServer server;
  WorkspaceHttp http;
  String auth;
  Identity verifier;
  AtomicReference<String> forwarded = new AtomicReference<>(),
      forwardedKey = new AtomicReference<>(),
      body = new AtomicReference<>();

  @BeforeEach
  void setup() throws Exception {
    var generator = KeyPairGenerator.getInstance("RSA");
    for (String name : List.of("fixture", "service")) {
      var pair = generator.generateKeyPair();
      Files.writeString(
          temp.resolve(name + "-private.pem"), pem("PRIVATE", pair.getPrivate().getEncoded()));
      Files.writeString(
          temp.resolve(name + "-public.pem"), pem("PUBLIC", pair.getPublic().getEncoded()));
    }
    var who = new Identity.Context("11111111-1111-4111-8111-111111111111", "synthetic-user");
    auth =
        "Bearer "
            + Identity.issue(
                who,
                temp.resolve("fixture-private.pem").toString(),
                "lab-fixture",
                "workspace-api",
                300);
    verifier =
        new Identity(temp.resolve("service-public.pem").toString(), "lab-bff", "asset-service", 60);
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/internal/v1/assets",
        exchange -> {
          forwarded.set(exchange.getRequestHeaders().getFirst("Authorization"));
          forwardedKey.set(exchange.getRequestHeaders().getFirst("Idempotency-Key"));
          body.set(new String(exchange.getRequestBody().readAllBytes()));
          String path = exchange.getRequestURI().getPath();
          int status =
              path.endsWith("00000000-0000-4000-8000-000000000000")
                  ? 404
                  : exchange.getRequestMethod().equals("POST") ? 202 : 200;
          byte[] response = "{}".getBytes();
          exchange.sendResponseHeaders(status, response.length);
          exchange.getResponseBody().write(response);
          exchange.close();
        });
    server.start();
    http =
        new WorkspaceHttp(
            new Identity(
                temp.resolve("fixture-public.pem").toString(), "lab-fixture", "workspace-api", 300),
            temp.resolve("service-private.pem").toString(),
            "http://127.0.0.1:" + server.getAddress().getPort());
  }

  String pem(String type, byte[] bytes) {
    return "-----BEGIN "
        + type
        + " KEY-----\n"
        + Base64.getEncoder().encodeToString(bytes)
        + "\n-----END "
        + type
        + " KEY-----";
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  @Test
  void forwardsVerifiedContextAndCanonicalMultipartEnvelope() throws Exception {
    var file =
        new MockMultipartFile(
            "file", "../../user-path.pdf", "application/pdf", "%PDF-1.7 synthetic".getBytes());
    assertEquals(202, http.upload(auth, "retry-key", file).getStatusCode().value());
    assertEquals("11111111-1111-4111-8111-111111111111", verifier.verify(forwarded.get()).tenant());
    assertNotEquals(auth, forwarded.get());
    assertEquals("retry-key", forwardedKey.get());
    assertTrue(body.get().contains("filename=\"synthetic.pdf\""));
    assertFalse(body.get().contains("user-path"));
    assertEquals(200, http.read(auth, UUID.randomUUID().toString()).getStatusCode().value());
    assertEquals(
        404, http.read(auth, "00000000-0000-4000-8000-000000000000").getStatusCode().value());
    assertEquals(202, http.upload(auth, null, file).getStatusCode().value());
  }

  @Test
  void rejectsIdentityInputAndInvalidKeysBeforeForwarding() {
    var file =
        new MockMultipartFile("file", "x.pdf", "application/pdf", "%PDF-1.7 synthetic".getBytes());
    assertEquals(401, assertThrows(HttpFailure.class, () -> http.upload(null, "key", file)).status);
    assertEquals(400, assertThrows(HttpFailure.class, () -> http.upload(auth, "", file)).status);
    assertEquals(
        400,
        assertThrows(HttpFailure.class, () -> http.upload(auth, "x".repeat(129), file)).status);
    assertThrows(IllegalArgumentException.class, () -> http.read(auth, "../outside"));
    assertNull(forwarded.get());
  }

  @Test
  void sanitizesUnexpectedProviderStatus() {
    server.removeContext("/internal/v1/assets");
    server.createContext(
        "/internal/v1/assets",
        exchange -> {
          exchange.sendResponseHeaders(502, -1);
          exchange.close();
        });
    assertEquals(
        503,
        assertThrows(HttpFailure.class, () -> http.read(auth, UUID.randomUUID().toString()))
            .status);
  }
}
