package dev.atlaslab.assets.application;

import dev.atlaslab.assets.domain.ArtifactModel.*;
import static dev.atlaslab.assets.domain.ArtifactModel.Failure.Kind.*;
import dev.atlaslab.assets.ports.*;
import dev.atlaslab.demo.PdfUpload;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Asset-owned artifact lifecycle; no persistence engine or provider schema. */
public final class ParsedArtifacts {
  private final ArtifactCatalog catalog;
  private final ArtifactStore content;
  private final int pendingLimit;
  public ParsedArtifacts(ArtifactCatalog catalog,ArtifactStore content) { this(catalog,content,100); }
  public ParsedArtifacts(ArtifactCatalog catalog,ArtifactStore content,int pendingLimit) {
    if(pendingLimit<1||pendingLimit>1000)throw new IllegalArgumentException("Invalid pending artifact limit");
    this.catalog=catalog;this.content=content;this.pendingLimit=pendingLimit;
  }
  public Staged stage(Stage stage,String payloadHash) {
    return save(stage,payloadHash,null);
  }
  public Staged importLegacy(Stage stage,String payloadHash,ArtifactMaintenance maintenance) {
    if(maintenance==null)throw new IllegalArgumentException("Explicit maintenance binding required");
    validate(stage);
    Manifest existing=catalog.committed(stage.tenant(),stage.assetId());
    if(existing!=null) {
      Stage old=existing.stage();Document document=stage.document();
      if(!old.inputEventId().equals(stage.inputEventId())||!old.correlationId().equals(stage.correlationId())||!old.sourceHash().equals(stage.sourceHash())
        ||!existing.markdownHash().equals(digest(document.markdown()))||!java.util.Objects.equals(existing.nativeHash(),document.nativeJson()==null?null:digest(document.nativeJson()))
        ||!old.document().converter().equals(document.converter())||!old.document().pipeline().equals(document.pipeline())||old.document().pages()!=document.pages())throw new Failure(CONFLICT);
      verify(existing);return new Staged(existing.artifactId(),false);
    }
    return save(stage,payloadHash,maintenance);
  }
  private Staged save(Stage stage,String payloadHash,ArtifactMaintenance maintenance) {
    validate(stage);
    return catalog.withStagingOwnership(stage.tenant(),()->{
      Binding binding=catalog.binding(stage.tenant(),stage.assetId());
      if(binding==null)throw new Failure(NOT_FOUND);
      if(!binding.sourceHash().equals(stage.sourceHash())||!binding.correlationId().equals(stage.correlationId())
          ||!binding.inputEventId().equals(stage.inputEventId()))throw new Failure(INVALID);
      Manifest previous=catalog.byKey(stage.tenant(),stage.key());
      if(previous!=null) {
        if(!previous.payloadHash().equals(payloadHash)||!previous.stage().assetId().equals(stage.assetId()))throw new Failure(CONFLICT);
        if(!previous.status().equals("WRITING")) {
          verify(previous);
          if(maintenance!=null&&!previous.status().equals("COMMITTED"))maintenance.commitImported(previous);
          return new Staged(previous.artifactId(),false);
        }
      }
      if(previous==null) {
        if(!binding.status().equals(maintenance==null?"PROCESSING":"COMPLETED"))throw new Failure(CONFLICT);
        if(catalog.pendingCount(stage.tenant())>=pendingLimit)throw new Failure(UNAVAILABLE);
        var document=stage.document();
        previous=new Manifest(UUID.nameUUIDFromBytes((stage.tenant()+":"+stage.key()).getBytes(StandardCharsets.UTF_8)).toString(),stage,payloadHash,
          digest(document.markdown()),document.nativeJson()==null?null:digest(document.nativeJson()),"WRITING");
        catalog.reserve(previous);
      }
      Document document=stage.document();
      content.putIfAbsent(ref(previous,"markdown"),bytes(document.markdown()),"text/markdown; charset=utf-8");
      if(document.nativeJson()!=null)content.putIfAbsent(ref(previous,"native"),bytes(document.nativeJson()),"application/json");
      verify(previous);
      if(maintenance==null)catalog.staged(stage.tenant(),previous.artifactId());else maintenance.commitImported(previous);
      return new Staged(previous.artifactId(),true);
    });
  }
  private void validate(Stage stage) {
    for(String value:new String[]{stage.tenant(),stage.assetId(),stage.inputEventId(),stage.correlationId(),stage.key()}) {
      if(value==null||!UUID.fromString(value).toString().equals(value))throw new Failure(INVALID);
    }
    Document document=stage.document();
    if(stage.fence()<1||stage.sourceHash()==null||!stage.sourceHash().matches("[a-f0-9]{64}")||document==null
      ||document.pages()<1||document.pages()>20||document.markdown()==null||document.markdown().isBlank()
      ||document.converter()==null||document.converter().isBlank()||document.converter().length()>128
      ||document.pipeline()==null||document.pipeline().isBlank()||document.pipeline().length()>128)throw new Failure(INVALID);
    if(bytes(document.markdown()).length+(document.nativeJson()==null?0:bytes(document.nativeJson()).length)>10*1024*1024)throw new Failure(TOO_LARGE);
  }
  public void verifyOutcome(String tenant,String asset,String artifact,String inputEvent,String correlation) {
    Manifest manifest=catalog.byId(tenant,asset,artifact);
    if(manifest==null||manifest.status().equals("WRITING"))throw new Failure(NOT_FOUND);
    if(!manifest.stage().inputEventId().equals(inputEvent)||!manifest.stage().correlationId().equals(correlation))throw new Failure(INVALID);
    verify(manifest);
  }
  public String read(String tenant,String asset,String format,boolean neutral) {
    Manifest manifest=catalog.committed(tenant,asset);
    if(manifest==null)throw new Failure(NOT_FOUND);
    String variant=format.equals("json")&&!neutral?"native":"markdown";
    String hash=variant.equals("native")?manifest.nativeHash():manifest.markdownHash();
    if(hash==null)throw new Failure(NOT_FOUND);
    byte[] data=content.read(ref(manifest,variant));
    if(!PdfUpload.digest(data).equals(hash))throw new Failure(UNAVAILABLE);
    return new String(data,StandardCharsets.UTF_8);
  }
  private void verify(Manifest manifest) {
    if(!PdfUpload.digest(content.read(ref(manifest,"markdown"))).equals(manifest.markdownHash()))throw new Failure(UNAVAILABLE);
    if(manifest.nativeHash()!=null&&!PdfUpload.digest(content.read(ref(manifest,"native"))).equals(manifest.nativeHash()))throw new Failure(UNAVAILABLE);
  }
  private static Ref ref(Manifest manifest,String variant) { return new Ref(manifest.stage().tenant(),manifest.artifactId(),variant); }
  private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
  private static String digest(String value) { return PdfUpload.digest(bytes(value)); }
}
