package dev.atlaslab.worker;

import java.nio.file.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;

/**
 * Subprocess entry point. Never renders, follows links, extracts attachments or executes content.
 */
public final class PdfProbe {
  private PdfProbe() {}

  public static int inspect(Path path) {
    try {
      if (Files.size(path) > 5 * 1024 * 1024 || Files.size(path) == 0) return 2;
      try (PDDocument doc = Loader.loadPDF(path.toFile())) {
        if (doc.isEncrypted() || doc.getNumberOfPages() < 1 || doc.getNumberOfPages() > 100)
          return 2;
        return 0;
      }
    } catch (Exception invalid) {
      return 2;
    }
  }

  public static void main(String[] args) {
    System.exit(args.length == 1 ? inspect(Path.of(args[0])) : 2);
  }
}
