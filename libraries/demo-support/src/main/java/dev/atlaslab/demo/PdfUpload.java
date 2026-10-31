package dev.atlaslab.demo;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import dev.atlaslab.demo.domain.Rejection;
import static dev.atlaslab.demo.domain.Rejection.Kind.*;

public final class PdfUpload {
  private PdfUpload() {}

  public static void validate(String filename, String type, byte[] bytes) {
    if (bytes.length > 5 * 1024 * 1024) throw new Rejection(TOO_LARGE);
    if (bytes.length == 0) throw new Rejection(EMPTY_DOCUMENT);
    if (filename == null
        || !filename.toLowerCase(Locale.ROOT).endsWith(".pdf")
        || !"application/pdf".equalsIgnoreCase(type))
      throw new Rejection(UNSUPPORTED_TYPE);
    if (bytes.length < 8 || !new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-"))
      throw new Rejection(INVALID_DOCUMENT);
  }

  public static String digest(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
