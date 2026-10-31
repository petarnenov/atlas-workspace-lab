package dev.atlaslab.assets.adapters.in;
import dev.atlaslab.assets.domain.AssetModel.Failure;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
@org.springframework.core.annotation.Order(0)
public class AssetFailures {
  @ExceptionHandler(dev.atlaslab.assets.domain.ArtifactModel.Failure.class)
  public ResponseEntity<?> artifact(dev.atlaslab.assets.domain.ArtifactModel.Failure error) {
    int status=switch(error.kind) { case NOT_FOUND -> 404; case INVALID -> 422; case CONFLICT -> 409; case TOO_LARGE -> 413; case UNAVAILABLE -> 503; };
    return ResponseEntity.status(status).body(Map.of("code",error.kind.name(),"message","Artifact unavailable","correlationId",UUID.randomUUID().toString()));
  }
  @ExceptionHandler(Failure.class)
  public ResponseEntity<?> failure(Failure error) {
    int status=switch(error.kind) { case INVALID_KEY,KEY_REUSED -> 400; case NOT_FOUND -> 404; case UNAVAILABLE -> 503; };
    return ResponseEntity.status(status).body(Map.of("code",error.kind.name(),"message","Asset request unavailable","correlationId",UUID.randomUUID().toString()));
  }
}
