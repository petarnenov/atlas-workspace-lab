package dev.atlaslab.assets;

import dev.atlaslab.demo.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@Import({Errors.class, KafkaSafety.class})
public class AssetApplication {
  @Bean
  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="lab.artifacts.enabled",havingValue="true")
  dev.atlaslab.assets.application.CompleteAsset completeAsset(Assets assets,dev.atlaslab.assets.application.ParsedArtifacts artifacts) {
    return new dev.atlaslab.assets.application.CompleteAsset(assets,artifacts);
  }
  @Bean
  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="lab.artifacts.enabled",havingValue="true")
  dev.atlaslab.assets.ports.ArtifactStore artifactStore(@Value("${lab.objects.endpoint}") String endpoint,
      @Value("${lab.objects.artifact-password}") String password,@Value("${lab.artifacts.store:s3}") String adapter) {
    if(!adapter.equals("s3"))throw new IllegalArgumentException("Unknown artifact store binding");
    return new dev.atlaslab.assets.adapters.out.S3Artifacts(endpoint,password);
  }
  @Bean
  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="lab.artifacts.enabled",havingValue="true")
  dev.atlaslab.assets.application.ParsedArtifacts parsedArtifacts(org.springframework.jdbc.core.JdbcTemplate db,
      dev.atlaslab.assets.ports.AssetPersistence persistence,dev.atlaslab.assets.ports.ArtifactStore content,@Value("${lab.artifacts.pending-limit:100}") int pendingLimit) {
    return new dev.atlaslab.assets.application.ParsedArtifacts(new dev.atlaslab.assets.adapters.out.JdbcArtifacts(db,persistence),content,pendingLimit);
  }
  @Bean
  dev.atlaslab.assets.ports.AssetPersistence persistence(org.springframework.jdbc.core.JdbcTemplate db,
      org.springframework.transaction.PlatformTransactionManager manager) {
    return new dev.atlaslab.assets.adapters.out.JdbcAssets(db,manager);
  }
  @Bean
  dev.atlaslab.assets.ports.SourceStore sources(ObjectsStore objects) {
    return new dev.atlaslab.assets.ports.SourceStore() {
      public void put(String reference,byte[] content) { objects.put(reference,content); }
      public void delete(String reference) { objects.delete(reference); }
    };
  }
  @Bean
  Assets assets(dev.atlaslab.assets.ports.AssetPersistence persistence,dev.atlaslab.assets.ports.SourceStore sources) {
    return new Assets(persistence,sources);
  }
  @Bean
  dev.atlaslab.assets.application.AssetDelivery delivery(dev.atlaslab.assets.ports.AssetPersistence persistence,
      dev.atlaslab.assets.ports.SourceStore sources,org.springframework.kafka.core.KafkaTemplate<String,String> kafka) {
    return new dev.atlaslab.assets.application.AssetDelivery(persistence,sources,
      dispatch->kafka.send("asset.uploaded.v1",dispatch.assetId(),dispatch.payload()).get(6,java.util.concurrent.TimeUnit.SECONDS));
  }
  public static void main(String[] args) {
    SpringApplication.run(AssetApplication.class, args);
  }

  @Bean
  Identity identity(@Value("${lab.identity.public-key}") String key) {
    return new Identity(key, "lab-bff", "asset-service", 60);
  }

  @Bean
  ObjectsStore objects(
      @Value("${lab.objects.endpoint}") String endpoint,
      @Value("${lab.objects.password}") String password) {
    return new ObjectsStore(endpoint, "asset_store", password);
  }
}
