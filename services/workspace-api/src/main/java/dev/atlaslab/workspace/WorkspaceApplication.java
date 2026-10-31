package dev.atlaslab.workspace;

import dev.atlaslab.demo.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.*;

@SpringBootApplication
@Import(Errors.class)
public class WorkspaceApplication {
  @Bean
  dev.atlaslab.workspace.application.WorkspaceCases workspaceCases(@Value("${lab.identity.private-key}") String key,
      @Value("${lab.asset.url}") String assets,@Value("${lab.worker.url:http://localhost:8082}") String worker,
      @Value("${lab.artifacts.enabled:false}") boolean portable,@Value("${lab.artifacts.legacy-read:true}") boolean legacy) {
    return new dev.atlaslab.workspace.application.WorkspaceCases(new dev.atlaslab.workspace.adapters.out.HttpAssetGateway(key,assets,worker,portable,legacy));
  }

  public static void main(String[] args) {
    SpringApplication.run(WorkspaceApplication.class, args);
  }

  @Bean
  Identity identity(@Value("${lab.identity.public-key}") String key) {
    return new Identity(key, "lab-fixture", "workspace-api", 300);
  }
}
