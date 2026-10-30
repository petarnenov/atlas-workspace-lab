package dev.atlaslab.workspace;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class WorkspaceApplicationTest {
    @Test void healthReturnsExpectedValue() {
        assertEquals("workspace-api:ok", new WorkspaceHealthController().health());
    }
}
