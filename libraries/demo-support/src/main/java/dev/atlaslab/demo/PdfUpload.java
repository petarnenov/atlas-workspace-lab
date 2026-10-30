package dev.atlaslab.demo;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public final class PdfUpload {
  private PdfUpload() {}

  public static void validate(String filename, String type, byte[] bytes) {
    if (bytes.length > ObjectsStore.MAX_BYTES)
      throw new HttpFailure(413, "TOO_LARGE", "Maximum file size is 5 MiB");
    if (bytes.length == 0) throw new HttpFailure(400, "EMPTY_DOCUMENT", "Document is empty");
    if (filename == null
        || !filename.toLowerCase(Locale.ROOT).endsWith(".pdf")
        || !"application/pdf".equalsIgnoreCase(type))
      throw new HttpFailure(415, "UNSUPPORTED_TYPE", "Only PDF documents are accepted");
    if (bytes.length < 8 || !new String(bytes, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-"))
      throw new HttpFailure(400, "INVALID_DOCUMENT", "Invalid PDF signature");
  }

  public static String digest(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
