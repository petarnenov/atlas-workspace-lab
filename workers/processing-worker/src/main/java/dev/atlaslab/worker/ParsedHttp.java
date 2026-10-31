package dev.atlaslab.worker;

import dev.atlaslab.demo.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
public class ParsedHttp {
  private final JdbcTemplate db;
  private final Identity identity;

  public ParsedHttp(JdbcTemplate db, @Value("${lab.identity.public-key}") String key) {
    this.db = db;
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
    var rows =
        db.queryForList(
            "SELECT markdown,document FROM parsed_document WHERE tenant_id=?::uuid AND"
                + " asset_id=?::uuid",
            who.tenant(),
            Wire.uuid(assetId));
    if (rows.isEmpty()) throw new HttpFailure(404, "NOT_FOUND", "Parsed copy not found");
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .header(
            "Content-Type",
            format.equals("markdown") ? "text/markdown; charset=utf-8" : "application/json")
        .body(rows.getFirst().get(format.equals("markdown") ? "markdown" : "document").toString());
  }
}
