package dev.atlaslab.worker;

import dev.atlaslab.demo.KafkaSafety;
import dev.atlaslab.demo.ObjectsStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@Import(KafkaSafety.class)
public class ProcessingWorkerApplication {
  public static void main(String[] args) {
    SpringApplication.run(ProcessingWorkerApplication.class, args);
  }

  @Bean
  ObjectsStore objects(
      @Value("${lab.objects.endpoint}") String endpoint,
      @Value("${lab.objects.password}") String password) {
    return new ObjectsStore(endpoint, "worker_reader", password);
  }
}
