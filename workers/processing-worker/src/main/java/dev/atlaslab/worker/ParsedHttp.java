package dev.atlaslab.worker;

import dev.atlaslab.demo.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class ParsedHttp {
  private final dev.atlaslab.worker.application.ReadLegacyCopy copies;
  private final Identity identity;

  public ParsedHttp(dev.atlaslab.worker.application.ReadLegacyCopy copies, @Value("${lab.identity.public-key}") String key) {
    this.copies = copies;
    this.identity = new Identity(key, "lab-bff", "worker-parsed-read", 60);
  }

  @GetMapping("/internal/v1/assets/{assetId}/parsed")
  public ResponseEntity<String> read(
      @RequestHeader(value = "Authorization", required = false) String auth,
      @PathVariable String assetId,
      @RequestParam(defaultValue = "markdown") String format) {
    var who = identity.verify(auth);
    if (!java.util.Set.of("markdown", "json").contains(format))
      throw new HttpFailure(400, "BAD_FORMAT", "Format must be markdown or json");
    String content=copies.read(who.tenant(),assetId,format);
    if(content==null)throw new HttpFailure(404,"NOT_FOUND","Parsed copy not found");
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .header(
            "Content-Type",
            format.equals("markdown") ? "text/markdown; charset=utf-8" : "application/json")
        .body(content);
  }
}
