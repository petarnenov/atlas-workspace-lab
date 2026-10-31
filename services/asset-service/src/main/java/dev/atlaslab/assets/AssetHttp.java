package dev.atlaslab.assets;

import dev.atlaslab.demo.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class AssetHttp {
  private final Identity identity;
  private final Assets assets;

  public AssetHttp(Identity identity, Assets assets) {
    this.identity = identity;
    this.assets = assets;
  }

  @PostMapping("/internal/v1/assets")
  public ResponseEntity<dev.atlaslab.assets.domain.AssetModel.Receipt> upload(
      @RequestHeader(value = "Authorization", required = false) String auth,
      @RequestHeader(value = "Idempotency-Key", required = false) String key,
      @RequestPart("file") MultipartFile file)
      throws Exception {
    Identity.Context who = identity.verify(auth);
    byte[] bytes = file.getInputStream().readNBytes(ObjectsStore.MAX_BYTES + 1);
    return ResponseEntity.accepted()
        .body(assets.upload(new dev.atlaslab.assets.domain.AssetModel.Actor(who.tenant(),who.subject()), key, file.getOriginalFilename(), file.getContentType(), bytes));
  }

  @GetMapping("/internal/v1/assets/{assetId}")
  public dev.atlaslab.assets.domain.AssetModel.Detail read(
      @RequestHeader(value = "Authorization", required = false) String auth,
      @PathVariable String assetId) {
    var who=identity.verify(auth);
    return assets.read(new dev.atlaslab.assets.domain.AssetModel.Actor(who.tenant(),who.subject()), assetId);
  }
}
