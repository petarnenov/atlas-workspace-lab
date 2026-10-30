package dev.atlaslab.worker;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ProcessingWorkerApplicationTest {
    @Test void healthReturnsExpectedValue() {
        assertEquals("processing-worker:ok", new WorkerHealthController().health());
    }
}
