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
