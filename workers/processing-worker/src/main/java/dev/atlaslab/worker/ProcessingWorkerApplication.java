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
@Import({KafkaSafety.class, dev.atlaslab.demo.Errors.class})
public class ProcessingWorkerApplication {
  @Bean
  WorkerEvents workerEvents(Checkpoints checkpoints,ObjectsStore sources,Sandbox sandbox,ParserClient parser,
      org.springframework.kafka.core.KafkaTemplate<String,String> kafka,
      @Value("${lab.artifacts.enabled:false}") boolean portable,@Value("${lab.artifacts.url:http://localhost:8081}") String artifacts,
      @Value("${lab.identity.worker-private-key:.local/worker-private.pem}") String signingKey,
      @Value("${lab.parser.adapter:http}") String parserAdapter) {
    if(!parserAdapter.equals("http"))throw new IllegalArgumentException("Unknown document parser binding");
    if(portable)return dev.atlaslab.worker.bootstrap.WorkerAssembly.createPortable(checkpoints,sources,sandbox,parser,kafka,artifacts,signingKey);
    return dev.atlaslab.worker.bootstrap.WorkerAssembly.create(checkpoints,sources,sandbox,parser,kafka);
  }
  @Bean
  dev.atlaslab.worker.application.ReadLegacyCopy legacyCopy(org.springframework.jdbc.core.JdbcTemplate db) {
    return new dev.atlaslab.worker.application.ReadLegacyCopy(new dev.atlaslab.worker.adapters.out.JdbcLegacyCopies(db));
  }

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
