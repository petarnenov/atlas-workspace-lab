package dev.atlaslab.workspace;

import dev.atlaslab.demo.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class ParsedProxy {
  private final Identity identity;
  private final String key, assets, worker;
  private final HttpClient client =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

  public ParsedProxy(
      Identity identity,
      @Value("${lab.identity.private-key}") String key,
      @Value("${lab.asset.url}") String assets,
      @Value("${lab.worker.url:http://localhost:8082}") String worker) {
    this.identity = identity;
    this.key = key;
    this.assets = assets;
    this.worker = worker;
  }

  @GetMapping("/api/v1/assets/{assetId}/parsed")
  public ResponseEntity<String> read(
      @RequestHeader(value = "Authorization", required = false) String auth,
      @PathVariable String assetId,
      @RequestParam(defaultValue = "markdown") String format)
      throws Exception {
    var who = identity.verify(auth);
    String id = Wire.uuid(assetId);
    if (!Set.of("markdown", "json").contains(format))
      throw new HttpFailure(400, "BAD_FORMAT", "Format must be markdown or json");
    var permitted = call(assets, "/internal/v1/assets/" + id, who, "asset-service");
    if (permitted.getStatusCode().value() != 200) return permitted;
    var result =
        call(
            worker,
            "/internal/v1/assets/" + id + "/parsed?format=" + format,
            who,
            "worker-parsed-read");
    return ResponseEntity.status(result.getStatusCode())
        .header("Cache-Control", "no-store")
        .header(
            "Content-Type",
            result.getStatusCode().value() == 200 && format.equals("markdown")
                ? "text/markdown; charset=utf-8"
                : "application/json")
        .body(result.getBody());
  }

  private ResponseEntity<String> call(
      String base, String path, Identity.Context who, String audience) throws Exception {
    var request =
        HttpRequest.newBuilder(URI.create(base + path))
            .timeout(Duration.ofSeconds(10))
            .header("Authorization", "Bearer " + Identity.issue(who, key, "lab-bff", audience, 60))
            .GET()
            .build();
    var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
    try (var stream = response.body()) {
      if (!Set.of(200, 400, 401, 403, 404, 503).contains(response.statusCode()))
        throw new HttpFailure(503, "UNAVAILABLE", "Parsed copy unavailable");
      byte[] bytes = stream.readNBytes(10 * 1024 * 1024 + 1);
      if (bytes.length > 10 * 1024 * 1024)
        throw new HttpFailure(503, "UNAVAILABLE", "Parsed copy unavailable");
      return ResponseEntity.status(response.statusCode())
          .header("Cache-Control", "no-store")
          .header("Content-Type", "application/json")
          .body(new String(bytes, StandardCharsets.UTF_8));
    }
  }
}
