package dev.atlaslab.worker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
public class ProcessingWorkerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ProcessingWorkerApplication.class, args);
    }
}

@RestController
class WorkerHealthController {
    @GetMapping("/health")
    String health() {
        return "processing-worker:ok";
    }
}
