package dev.atlaslab.workspace;

import dev.atlaslab.demo.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.*;

@SpringBootApplication
@Import(Errors.class)
public class WorkspaceApplication {
  public static void main(String[] args) {
    SpringApplication.run(WorkspaceApplication.class, args);
  }

  @Bean
  Identity identity(@Value("${lab.identity.public-key}") String key) {
    return new Identity(key, "lab-fixture", "workspace-api", 300);
  }
}
