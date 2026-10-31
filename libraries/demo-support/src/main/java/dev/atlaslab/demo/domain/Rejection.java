package dev.atlaslab.demo.domain;

/** Protocol-independent rejection; adapters select the HTTP representation. */
public final class Rejection extends RuntimeException {
  public enum Kind { TOO_LARGE, EMPTY_DOCUMENT, UNSUPPORTED_TYPE, INVALID_DOCUMENT }
  private final Kind kind;
  public Rejection(Kind kind) { super(kind.name()); this.kind=kind; }
  public Kind kind() { return kind; }
}
