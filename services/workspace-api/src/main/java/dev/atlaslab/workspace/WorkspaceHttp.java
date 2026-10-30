package dev.atlaslab.workspace;

import dev.atlaslab.demo.*;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class WorkspaceHttp {
  private final Identity identity;
  private final String signingKey;
  private final String assetUrl;
  private final HttpClient client =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

  public WorkspaceHttp(
      Identity identity,
      @Value("${lab.identity.private-key}") String signingKey,
      @Value("${lab.asset.url}") String url) {
    this.identity = identity;
    this.signingKey = signingKey;
    this.assetUrl = url;
  }

  @PostMapping("/api/v1/assets")
  public ResponseEntity<String> upload(
      @RequestHeader(value = "Authorization", required = false) String auth,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @RequestPart("file") MultipartFile file)
      throws Exception {
    Identity.Context who = identity.verify(auth);
    if (key != null && (key.isBlank() || key.length() > 128))
      throw new HttpFailure(400, "INVALID_KEY", "Invalid Idempotency-Key");
    byte[] bytes = file.getInputStream().readNBytes(ObjectsStore.MAX_BYTES + 1);
    PdfUpload.validate(file.getOriginalFilename(), file.getContentType(), bytes);
    String boundary = "lab-" + UUID.randomUUID();
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    body.write(
        ("--"
                + boundary
                + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"synthetic.pdf\"\r\n"
                + "Content-Type: application/pdf\r\n\r\n")
            .getBytes(StandardCharsets.US_ASCII));
    body.write(bytes);
    body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.US_ASCII));
    HttpRequest.Builder request =
        request(who, "/internal/v1/assets")
            .header("Content-Type", "multipart/form-data; boundary=" + boundary);
    if (key != null) request.header("Idempotency-Key", key);
    return forward(
        request.POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build());
  }

  @GetMapping("/api/v1/assets/{assetId}")
  public ResponseEntity<String> read(
      @RequestHeader(value = "Authorization", required = false) String auth,
      @PathVariable String assetId)
      throws Exception {
    Identity.Context who = identity.verify(auth);
    return forward(request(who, "/internal/v1/assets/" + Wire.uuid(assetId)).GET().build());
  }

  private HttpRequest.Builder request(Identity.Context who, String path) {
    return HttpRequest.newBuilder(URI.create(assetUrl + path))
        .timeout(Duration.ofSeconds(10))
        .header(
            "Authorization",
            "Bearer " + Identity.issue(who, signingKey, "lab-bff", "asset-service", 60));
  }

  private ResponseEntity<String> forward(HttpRequest request) throws Exception {
    HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
    int status = response.statusCode();
    if (!java.util.Set.of(200, 202, 400, 401, 403, 404, 413, 415, 503).contains(status))
      throw new HttpFailure(503, "UNAVAILABLE", "Asset service unavailable");
    return ResponseEntity.status(status)
        .header("Content-Type", "application/json")
        .body(response.body());
  }
}
