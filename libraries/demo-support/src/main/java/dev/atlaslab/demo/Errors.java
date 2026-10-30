package dev.atlaslab.demo;

import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class Errors {
  @ExceptionHandler(HttpFailure.class)
  public ResponseEntity<?> failure(HttpFailure e) {
    return response(e.status, e.code, e.getMessage());
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  public ResponseEntity<?> size(Exception e) {
    return response(413, "TOO_LARGE", "Maximum file size is 5 MiB");
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    org.springframework.web.bind.MissingServletRequestParameterException.class,
    org.springframework.web.multipart.support.MissingServletRequestPartException.class
  })
  public ResponseEntity<?> bad(Exception e) {
    return response(400, "BAD_REQUEST", "Invalid request");
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<?> dependency(Exception e) {
    return response(503, "UNAVAILABLE", "Service temporarily unavailable");
  }

  private ResponseEntity<?> response(int status, String code, String message) {
    return ResponseEntity.status(status)
        .body(
            Map.of(
                "code", code, "message", message, "correlationId", UUID.randomUUID().toString()));
  }
}
