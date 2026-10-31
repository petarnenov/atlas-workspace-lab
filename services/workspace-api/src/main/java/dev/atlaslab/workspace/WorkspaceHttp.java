package dev.atlaslab.workspace;
import dev.atlaslab.demo.*;
import dev.atlaslab.workspace.application.WorkspaceCases;
import dev.atlaslab.workspace.domain.WorkspaceModel.*;
import dev.atlaslab.workspace.adapters.in.WorkspaceResponses;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class WorkspaceHttp {
  private final Identity identity;
  private final WorkspaceCases cases;
  public WorkspaceHttp(Identity identity,WorkspaceCases cases) { this.identity=identity;this.cases=cases; }
  @PostMapping("/api/v1/assets")
  public ResponseEntity<String> upload(@RequestHeader(value="Authorization",required=false) String auth,
      @RequestHeader(value="Idempotency-Key",required=false) String key,@RequestPart("file") MultipartFile file) throws Exception {
    var who=identity.verify(auth);
    byte[] bytes=file.getInputStream().readNBytes(5*1024*1024+1);
    try { return WorkspaceResponses.response(cases.upload(new Actor(who.tenant(),who.subject()),key,file.getOriginalFilename(),file.getContentType(),bytes)); }
    catch(InvalidKey rejected) { throw new HttpFailure(400,"INVALID_KEY","Invalid Idempotency-Key"); }
  }
  @GetMapping("/api/v1/assets/{assetId}")
  public ResponseEntity<String> read(@RequestHeader(value="Authorization",required=false) String auth,
      @PathVariable String assetId) throws Exception {
    var who=identity.verify(auth);
    return WorkspaceResponses.response(cases.read(new Actor(who.tenant(),who.subject()),assetId));
  }
}
