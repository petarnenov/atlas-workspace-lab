package dev.atlaslab.workspace;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import dev.atlaslab.demo.*;
import java.net.*;
import java.nio.file.*;
import java.security.KeyPairGenerator;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class ParsedProxyTest {
  @TempDir Path temp;
  HttpServer server;
  ParsedProxy proxy;
  String auth;
  int assetStatus = 200, workerStatus = 200, calls;

  @BeforeEach
  void setup() throws Exception {
    var pair = KeyPairGenerator.getInstance("RSA").generateKeyPair();
    for (var item :
        Map.of("public", pair.getPublic().getEncoded(), "private", pair.getPrivate().getEncoded())
            .entrySet())
      Files.writeString(
          temp.resolve(item.getKey() + ".pem"),
          "-----BEGIN "
              + item.getKey().toUpperCase()
              + " KEY-----\n"
              + Base64.getEncoder().encodeToString(item.getValue())
              + "\n-----END "
              + item.getKey().toUpperCase()
              + " KEY-----");
    var identity =
        new Identity(temp.resolve("public.pem").toString(), "lab-fixture", "workspace-api", 300);
    auth =
        "Bearer "
            + Identity.issue(
                new Identity.Context(Identity.TENANTS.iterator().next(), "test"),
                temp.resolve("private.pem").toString(),
                "lab-fixture",
                "workspace-api",
                300);
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/internal/v1/assets",
        exchange -> {
          boolean parsed = exchange.getRequestURI().getPath().endsWith("/parsed");
          String audience = parsed ? "worker-parsed-read" : "asset-service";
          var verified =
              new Identity(temp.resolve("public.pem").toString(), "lab-bff", audience, 60)
                  .verify(exchange.getRequestHeaders().getFirst("Authorization"));
          assertEquals("test", verified.subject());
          if (parsed) calls++;
          byte[] body = (parsed ? "Saved text" : "{}").getBytes();
          exchange.sendResponseHeaders(parsed ? workerStatus : assetStatus, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    server.start();
    String base = "http://127.0.0.1:" + server.getAddress().getPort();
    proxy = new ParsedProxy(identity,new dev.atlaslab.workspace.application.WorkspaceCases(new dev.atlaslab.workspace.adapters.out.HttpAssetGateway(temp.resolve("private.pem").toString(),base,base,false,true)));
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  @Test
  void authorizesAssetBeforeReadingScopedArtifact() throws Exception {
    String id = UUID.randomUUID().toString();
    assertEquals("Saved text", proxy.read(auth, id, "markdown").getBody());
    assertEquals(
        "text/markdown; charset=utf-8",
        proxy.read(auth, id, "markdown").getHeaders().getFirst("Content-Type"));
    assertEquals(
        "application/json", proxy.read(auth, id, "json").getHeaders().getFirst("Content-Type"));
    assertEquals("no-store", proxy.read(auth, id, "json").getHeaders().getFirst("Cache-Control"));
    assetStatus = 404;
    int previous = calls;
    assertEquals(404, proxy.read(auth, id, "markdown").getStatusCode().value());
    assertEquals(previous, calls);
    assetStatus = 200;
    workerStatus = 404;
    assertEquals(404, proxy.read(auth, id, "json").getStatusCode().value());
    workerStatus = 500;
    assertEquals(503, assertThrows(HttpFailure.class, () -> proxy.read(auth, id, "json")).status);
    assertThrows(HttpFailure.class, () -> proxy.read(null, id, "markdown"));
    assertThrows(HttpFailure.class, () -> proxy.read(auth, id, "html"));
    assertThrows(IllegalArgumentException.class, () -> proxy.read(auth, "../secret", "markdown"));
  }
}
