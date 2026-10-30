package dev.atlaslab.worker;

import java.nio.file.*;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class Sandbox {
  private final String jar;

  public Sandbox(@Value("${lab.parser.jar}") String jar) {
    this.jar = jar;
  }

  public String inspect(byte[] bytes) {
    Path input = null;
    Process process = null;
    try {
      input = Files.createTempFile("lab-synthetic-", ".pdf");
      Files.write(input, bytes);
      process =
          new ProcessBuilder(
                  Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                  "-Xmx64m",
                  "-XX:MaxMetaspaceSize=64m",
                  "-jar",
                  jar,
                  input.toString())
              .redirectOutput(ProcessBuilder.Redirect.DISCARD)
              .redirectError(ProcessBuilder.Redirect.DISCARD)
              .start();
      if (!process.waitFor(10, TimeUnit.SECONDS)) {
        process.destroyForcibly();
        process.waitFor(2, TimeUnit.SECONDS);
        return "PROCESSING_ERROR";
      }
      return process.exitValue() == 0
          ? null
          : process.exitValue() == 2 ? "INVALID_DOCUMENT" : "PROCESSING_ERROR";
    } catch (Exception error) {
      if (error instanceof InterruptedException) Thread.currentThread().interrupt();
      return "PROCESSING_ERROR";
    } finally {
      if (process != null && process.isAlive()) process.destroyForcibly();
      if (input != null)
        try {
          Files.deleteIfExists(input);
        } catch (Exception ignored) {
          /* Local OS temp cleanup remains available. */
        }
    }
  }
}
