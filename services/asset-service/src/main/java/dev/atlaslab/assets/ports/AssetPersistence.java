package dev.atlaslab.assets.ports;

import dev.atlaslab.assets.domain.AssetModel.*;
import java.util.List;
import java.util.function.Function;
import java.util.function.Supplier;

public interface AssetPersistence {
  <T> T withUploadOwnership(String scope,Supplier<T> operation);
  Intent previous(Actor actor,String key);
  Intent reserve(Intent intent);
  void commitUpload(Intent intent);
  boolean exists(String assetId);
  void forgetUncommitted(String assetId);
  Detail read(Actor actor,String assetId);
  void applyOutcome(Outcome outcome,String payloadHash,Function<State,Decision> decide);
  void finding(String eventId,String reason);
  List<String> pendingDispatches();
  Dispatch claimDispatch(String eventId);
  void dispatched(String eventId);
  void dispatchFailed(String eventId);
  void expireProcessing();
  List<Intent> abandonedIntents();
  void withAbandonedOwnership(Intent intent,Runnable operation);
}
