package dev.atlaslab.assets;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class AssetApplicationTest {
    @Test void healthReturnsExpectedValue() {
        assertEquals("asset-service:ok", new AssetHealthController().health());
    }
}
