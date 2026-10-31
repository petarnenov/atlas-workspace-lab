package dev.atlaslab.workspace.adapters.in;
import dev.atlaslab.workspace.domain.WorkspaceModel.Reply;
import org.springframework.http.ResponseEntity;
public final class WorkspaceResponses {
  private WorkspaceResponses() {}
  public static ResponseEntity<String> response(Reply reply) {
    int status=switch(reply.code()) {
      case OK->200;case ACCEPTED->202;case INVALID->400;case UNAUTHENTICATED->401;
      case DENIED->403;case MISSING->404;case TOO_LARGE->413;case UNSUPPORTED->415;case UNAVAILABLE->503;
    };
    return ResponseEntity.status(status).header("Cache-Control","no-store")
      .header("Content-Type",reply.markdown()?"text/markdown; charset=utf-8":"application/json").body(reply.body());
  }
}
