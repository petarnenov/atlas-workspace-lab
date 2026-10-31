package dev.atlaslab.worker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.atlaslab.demo.PdfUpload;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Restricted client: fixed endpoint, bounded bytes, no document-provided URLs/options. */
@Component
public class ParserClient {
  static final int MAX_OUTPUT = 10 * 1024 * 1024;
  static final String PIPELINE = "atlas-pdf-v1-heron8f39ad3c-tablefc0f2d45-ocr-off";
  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  private final URI endpoint;
  private final String tokenFile;
  private final ObjectMapper mapper = new ObjectMapper();

  public record Parsed(
      String hash, String version, String pipeline, int pages, String markdown, String document) {}

  public static class Rejected extends Exception {}

  public ParserClient(
      @Value("${lab.docling.url}") String url,
      @Value("${lab.docling.token-file}") String tokenFile) {
    endpoint = URI.create(url + "/internal/v1/parse");
    this.tokenFile = tokenFile;
  }

  public Parsed parse(byte[] pdf) throws Exception {
    String token = Files.readString(Path.of(tokenFile)).strip();
    HttpRequest request =
        HttpRequest.newBuilder(endpoint)
            .timeout(Duration.ofSeconds(45))
            .header("Content-Type", "application/pdf")
            .header("Authorization", "Bearer " + token)
            .POST(HttpRequest.BodyPublishers.ofByteArray(pdf))
            .build();
    long started = System.nanoTime();
    var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
    try (var stream = response.body()) {
      int status = response.statusCode();
      if (status == 400 || status == 413 || status == 422) throw new Rejected();
      if (status != 200) throw new java.io.IOException("PARSER_UNAVAILABLE");
      var reader = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor();
      byte[] bytes;
      var pending = reader.submit(() -> stream.readNBytes(MAX_OUTPUT + 1));
      try {
        long remaining = Duration.ofSeconds(45).toNanos() - (System.nanoTime() - started);
        bytes = pending.get(Math.max(1, remaining), java.util.concurrent.TimeUnit.NANOSECONDS);
      } finally {
        stream.close();
        pending.cancel(true);
        reader.shutdownNow();
      }
      if (bytes.length > MAX_OUTPUT) throw new Rejected();
      return validate(pdf, bytes);
    }
  }

  Parsed validate(byte[] pdf, byte[] bytes) throws Rejected {
    try {
      JsonNode node = mapper.readTree(bytes);
      String hash = node.path("sourceSha256").asText();
      String version = node.path("parserVersion").asText();
      String pipeline = node.path("pipelineVersion").asText();
      JsonNode doc = node.path("document");
      int pages = node.path("pageCount").asInt();
      String markdown = node.path("markdown").asText();
      if (bytes.length > MAX_OUTPUT
          || !PdfUpload.digest(pdf).equals(hash)
          || !"2.145.0".equals(version)
          || !PIPELINE.equals(pipeline)
          || pages < 1
          || pages > 20
          || !node.path("pageCount").isIntegralNumber()
          || !node.path("markdown").isTextual()
          || markdown.isBlank()
          || !doc.isObject()
          || !"DoclingDocument".equals(doc.path("schema_name").asText())
          || !doc.path("version").asText().matches("1\\.[0-9]+\\.[0-9]+")
          || node.size() != 6) throw new Rejected();
      return new Parsed(hash, version, pipeline, pages, markdown, mapper.writeValueAsString(doc));
    } catch (Rejected rejected) {
      throw rejected;
    } catch (Exception invalid) {
      throw new Rejected();
    }
  }
}
