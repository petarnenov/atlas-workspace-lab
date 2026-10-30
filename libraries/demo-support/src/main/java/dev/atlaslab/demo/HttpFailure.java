package dev.atlaslab.demo;

public final class HttpFailure extends RuntimeException {
  public final int status;
  public final String code;

  public HttpFailure(int status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
