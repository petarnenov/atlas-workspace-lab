package dev.atlaslab.worker;

import com.fasterxml.jackson.databind.JsonNode;
import dev.atlaslab.worker.domain.WorkModel.Parsed;
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
public class ParserClient implements dev.atlaslab.worker.ports.ProcessingPorts.DocumentParser {
  static final int MAX_OUTPUT = 10 * 1024 * 1024;
  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  private final URI endpoint;
  private final String tokenFile;
  private final ObjectMapper mapper = new ObjectMapper();

  public static class Rejected extends dev.atlaslab.worker.ports.ProcessingPorts.DocumentParser.Rejected {}

  public ParserClient(
      @Value("${lab.docling.url}") String url,
      @Value("${lab.docling.token-file}") String tokenFile) {
    endpoint = URI.create(url + "/internal/v2/parse");
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
      JsonNode provenance=node.path("provenance"),doc=node.path("document");
      String version=provenance.path("converter").asText(),pipeline=provenance.path("pipeline").asText();
      int pages=node.path("pageCount").asInt();
      String markdown=doc.path("markdown").asText();
      JsonNode nativeArtifact=node.get("native");
      if(bytes.length>MAX_OUTPUT||!PdfUpload.digest(pdf).equals(hash)||pages<1||pages>20
          ||!node.path("pageCount").isIntegralNumber()||!doc.isObject()||doc.size()!=2
          ||!doc.path("schemaVersion").isTextual()||!"1".equals(doc.path("schemaVersion").asText())||!doc.path("markdown").isTextual()||markdown.isBlank()
          ||!provenance.isObject()||provenance.size()!=2||!provenance.path("converter").isTextual()
          ||!provenance.path("pipeline").isTextual()||version.isBlank()||version.length()>128||pipeline.isBlank()||pipeline.length()>128
          ||node.size()!=(nativeArtifact==null?4:5)
          ||nativeArtifact!=null&&(!nativeArtifact.isObject()||nativeArtifact.size()!=2
            ||!"application/json".equals(nativeArtifact.path("mediaType").asText())||!nativeArtifact.path("content").isObject()))throw new Rejected();
      return new Parsed(hash,version,pipeline,pages,markdown,nativeArtifact==null?null:mapper.writeValueAsString(nativeArtifact.get("content")));
    } catch (Rejected rejected) {
      throw rejected;
    } catch (Exception invalid) {
      throw new Rejected();
    }
  }
}
