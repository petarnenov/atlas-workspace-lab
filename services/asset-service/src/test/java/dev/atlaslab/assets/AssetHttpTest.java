package dev.atlaslab.assets;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import dev.atlaslab.demo.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class AssetHttpTest {
  @Test
  void uploadAndStatusEnforceVerifiedContext() throws Exception {
    var identity = mock(Identity.class);
    var assets = mock(Assets.class);
    var who = new Identity.Context("tenant", "user");
    when(identity.verify("Bearer fixture")).thenReturn(who);
    var actor=new dev.atlaslab.assets.domain.AssetModel.Actor(who.tenant(),who.subject());
    var receipt = new dev.atlaslab.assets.domain.AssetModel.Receipt("asset", "PENDING", "correlation");
    when(assets.upload(eq(actor), eq("key"), eq("a.pdf"), eq("application/pdf"), any()))
        .thenReturn(receipt);
    var api = new AssetHttp(identity, assets);
    assertEquals(
        receipt,
        api.upload(
                "Bearer fixture",
                "key",
                new MockMultipartFile("file", "a.pdf", "application/pdf", "%PDF-1.7".getBytes()))
            .getBody());
    api.read("Bearer fixture", "asset");
    verify(assets).read(actor, "asset");
    when(identity.verify(null)).thenThrow(new HttpFailure(401, "UNAUTHORIZED", "Denied"));
    assertThrows(HttpFailure.class, () -> api.read(null, "asset"));
  }
}
