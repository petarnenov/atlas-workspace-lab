package dev.atlaslab.worker;

import static org.junit.jupiter.api.Assertions.*;

import java.io.*;
import java.nio.file.*;
import java.util.jar.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.encryption.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class SandboxTest {
  @TempDir Path temp;

  byte[] pdf(boolean encrypted, int pages) throws Exception {
    try (PDDocument doc = new PDDocument();
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      for (int i = 0; i < pages; i++) doc.addPage(new PDPage());
      if (encrypted)
        doc.protect(new StandardProtectionPolicy("owner", "user", new AccessPermission()));
      doc.save(out);
      return out.toByteArray();
    }
  }

  @Test
  void parserAcceptsSyntheticDocumentAndRejectsMalformedEncryptedEmptyAndHuge() throws Exception {
    Path file = temp.resolve("synthetic.pdf");
    Files.write(file, pdf(false, 1));
    assertEquals(0, PdfProbe.inspect(file));
    Files.write(file, pdf(true, 1));
    assertEquals(2, PdfProbe.inspect(file));
    Files.write(file, pdf(false, 101));
    assertEquals(2, PdfProbe.inspect(file));
    Files.write(file, new byte[0]);
    assertEquals(2, PdfProbe.inspect(file));
    Files.write(file, "%PDF-1.7 malformed".getBytes());
    assertEquals(2, PdfProbe.inspect(file));
    Files.write(file, new byte[5 * 1024 * 1024 + 1]);
    assertEquals(2, PdfProbe.inspect(file));
    assertEquals(2, PdfProbe.inspect(temp.resolve("missing")));
  }

  @Test
  void subprocessHandlesValidInvalidAndMissingParser() throws Exception {
    String jar =
        Path.of("build/libs/processing-worker-0.1.0-SNAPSHOT-parser.jar")
            .toAbsolutePath()
            .toString();
    var sandbox = new Sandbox(jar);
    assertNull(sandbox.inspect(pdf(false, 1)));
    assertEquals("INVALID_DOCUMENT", sandbox.inspect("%PDF-1.7 invalid".getBytes()));
    assertEquals("PROCESSING_ERROR", new Sandbox("missing.jar").inspect(pdf(false, 1)));
  }

  public static class Sleep {
    public static void main(String[] args) throws Exception {
      Thread.sleep(60000);
    }
  }

  @Test
  void subprocessDeadlineKillsStalledParser() throws Exception {
    Path jar = temp.resolve("sleep.jar");
    Manifest manifest = new Manifest();
    manifest.getMainAttributes().putValue("Manifest-Version", "1.0");
    manifest.getMainAttributes().putValue("Main-Class", Sleep.class.getName());
    String name = Sleep.class.getName().replace('.', '/') + ".class";
    try (JarOutputStream out = new JarOutputStream(Files.newOutputStream(jar), manifest);
        InputStream in = Sleep.class.getClassLoader().getResourceAsStream(name)) {
      out.putNextEntry(new JarEntry(name));
      in.transferTo(out);
      out.closeEntry();
    }
    long start = System.nanoTime();
    assertEquals("PROCESSING_ERROR", new Sandbox(jar.toString()).inspect(new byte[] {1}));
    assertTrue((System.nanoTime() - start) / 1_000_000_000L < 15);
  }
}
