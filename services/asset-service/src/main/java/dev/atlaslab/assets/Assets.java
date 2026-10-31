package dev.atlaslab.assets;

import dev.atlaslab.assets.domain.AssetModel.*;
import static dev.atlaslab.assets.domain.AssetModel.Failure.Kind.*;
import dev.atlaslab.assets.ports.*;
import dev.atlaslab.demo.PdfUpload;
import java.util.UUID;

/** Upload/query/outcome policy. Framework and persistence details stay outside. */
public final class Assets {
  private final AssetPersistence persistence;
  private final SourceStore sources;
  public Assets(AssetPersistence persistence,SourceStore sources) {
    this.persistence=persistence;this.sources=sources;
  }
  public Receipt upload(Actor actor,String key,String filename,String type,byte[] bytes) {
    PdfUpload.validate(filename,type,bytes);
    if(key!=null&&(key.isBlank()||key.length()>128))throw new Failure(INVALID_KEY);
    String digest=PdfUpload.digest(bytes);
    String scope=actor.tenant()+":"+actor.subject()+":"+(key==null?UUID.randomUUID():key);
    return persistence.withUploadOwnership(scope,()->{
      Intent old=key==null?null:persistence.previous(actor,key);
      if(old!=null) {
        if(!digest.equals(old.digest()))throw new Failure(KEY_REUSED);
        if(old.committed())return old.receipt();
        return persist(old,bytes);
      }
      var intent=new Intent(UUID.randomUUID().toString(),actor.tenant(),actor.subject(),key,
          digest,UUID.randomUUID()+".pdf",UUID.randomUUID().toString(),scope,false);
      return persist(persistence.reserve(intent),bytes);
    });
  }
  private Receipt persist(Intent intent,byte[] bytes) {
    try {
      sources.put(intent.objectKey(),bytes);
      persistence.commitUpload(intent);
      return intent.receipt();
    } catch(Exception unavailable) {
      // Unknown commit acknowledgement must never destroy committed source bytes.
      try {
        if(persistence.exists(intent.assetId()))return intent.receipt();
        sources.delete(intent.objectKey());
        persistence.forgetUncommitted(intent.assetId());
      } catch(Exception uncertain) { /* Keep the intent for recovery. */ }
      throw new Failure(UNAVAILABLE);
    }
  }
  public Detail read(Actor actor,String id) {
    String canonical=UUID.fromString(id).toString();
    if(!canonical.equalsIgnoreCase(id))throw new IllegalArgumentException("Invalid UUID");
    Detail detail=persistence.read(actor,canonical);
    if(detail==null)throw new Failure(NOT_FOUND);
    return detail;
  }
  public void outcome(Outcome outcome,String payloadHash) {
    persistence.applyOutcome(outcome,payloadHash,state->{
      if(state==null)return Decision.UNKNOWN_ASSET;
      if(!state.tenantId().equals(outcome.tenantId())||!state.correlationId().equals(outcome.correlationId()))
        return Decision.SCOPE_MISMATCH;
      return state.status().equals("PROCESSING")?Decision.APPLY:Decision.TERMINAL_OR_OUT_OF_ORDER;
    });
  }
}
