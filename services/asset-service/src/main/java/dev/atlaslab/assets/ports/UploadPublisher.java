package dev.atlaslab.assets.ports;
import dev.atlaslab.assets.domain.AssetModel.Dispatch;
public interface UploadPublisher { void publish(Dispatch dispatch) throws Exception; }
