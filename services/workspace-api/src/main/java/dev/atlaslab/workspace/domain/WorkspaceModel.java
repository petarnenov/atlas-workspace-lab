package dev.atlaslab.workspace.domain;
public final class WorkspaceModel {
  private WorkspaceModel() {}
  public record Actor(String tenant,String subject) {}
  public enum Code { OK, ACCEPTED, INVALID, UNAUTHENTICATED, DENIED, MISSING, TOO_LARGE, UNSUPPORTED, UNAVAILABLE }
  public record Reply(Code code,String body,boolean markdown) {}
  public static final class InvalidKey extends RuntimeException {}
}
