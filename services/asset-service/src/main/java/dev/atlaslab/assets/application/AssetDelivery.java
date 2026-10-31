package dev.atlaslab.assets.application;

import dev.atlaslab.assets.ports.*;

/** Durable send and abandoned-intent policy, independent of broker and SQL. */
public final class AssetDelivery {
  private final AssetPersistence persistence;
  private final SourceStore sources;
  private final UploadPublisher publisher;
  public AssetDelivery(AssetPersistence persistence,SourceStore sources,UploadPublisher publisher) {
    this.persistence=persistence;this.sources=sources;this.publisher=publisher;
  }
  public void dispatch() {
    for(String id:persistence.pendingDispatches()) {
      var dispatch=persistence.claimDispatch(id);
      if(dispatch==null)continue;
      try { publisher.publish(dispatch);persistence.dispatched(id); }
      catch(Exception unavailable) { persistence.dispatchFailed(id); }
    }
  }
  public void reconcile() {
    persistence.expireProcessing();
    for(var intent:persistence.abandonedIntents()) {
      try {
        persistence.withAbandonedOwnership(intent,()->{
          if(!persistence.exists(intent.assetId())) {
            sources.delete(intent.objectKey());persistence.forgetUncommitted(intent.assetId());
          }
        });
      } catch(Exception unavailable) { /* Retain unknown state for the next cycle. */ }
    }
  }
}
