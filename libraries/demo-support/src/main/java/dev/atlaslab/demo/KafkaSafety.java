package dev.atlaslab.demo;

import org.springframework.context.annotation.*;
import org.springframework.kafka.listener.*;

/** Database/handler failure must never be recovered by logging and committing input. */
@Configuration
public class KafkaSafety {
  @Bean
  public CommonErrorHandler kafkaErrorHandler() {
    return new CommonContainerStoppingErrorHandler();
  }
}
