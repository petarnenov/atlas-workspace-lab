package dev.atlaslab.workspace;
import dev.atlaslab.demo.*;
import dev.atlaslab.workspace.application.WorkspaceCases;
import dev.atlaslab.workspace.domain.WorkspaceModel.Actor;
import dev.atlaslab.workspace.adapters.in.WorkspaceResponses;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class ParsedProxy {
  private final Identity identity;
  private final WorkspaceCases cases;
  public ParsedProxy(Identity identity,WorkspaceCases cases) { this.identity=identity;this.cases=cases; }
  @GetMapping("/api/v1/assets/{assetId}/parsed")
  public ResponseEntity<String> read(@RequestHeader(value="Authorization",required=false) String auth,
      @PathVariable String assetId,@RequestParam(defaultValue="markdown") String format) throws Exception {
    return readVersion(auth,assetId,format,false);
  }
  @GetMapping("/api/v2/assets/{assetId}/parsed")
  public ResponseEntity<String> readNeutral(@RequestHeader(value="Authorization",required=false) String auth,
      @PathVariable String assetId,@RequestParam(defaultValue="markdown") String format) throws Exception {
    return readVersion(auth,assetId,format,true);
  }
  private ResponseEntity<String> readVersion(String auth,String id,String format,boolean neutral) throws Exception {
    var who=identity.verify(auth);
    if(!java.util.Set.of("markdown","json").contains(format))throw new HttpFailure(400,"BAD_FORMAT","Invalid format");
    return WorkspaceResponses.response(cases.parsed(new Actor(who.tenant(),who.subject()),id,format,neutral));
  }
}
