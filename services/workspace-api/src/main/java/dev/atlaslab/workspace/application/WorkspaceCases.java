package dev.atlaslab.workspace.application;
import dev.atlaslab.workspace.domain.WorkspaceModel.*;
import dev.atlaslab.workspace.ports.AssetGateway;
import dev.atlaslab.demo.PdfUpload;
import java.util.*;

public final class WorkspaceCases {
  private final AssetGateway assets;
  public WorkspaceCases(AssetGateway assets) { this.assets=assets; }
  public Reply upload(Actor who,String key,String filename,String mediaType,byte[] bytes) throws Exception {
    if(key!=null&&(key.isBlank()||key.length()>128))throw new InvalidKey();
    PdfUpload.validate(filename,mediaType,bytes);
    return assets.upload(who,key,bytes);
  }
  public Reply read(Actor who,String id) throws Exception { return assets.asset(who,canonical(id)); }
  public Reply parsed(Actor who,String id,String format,boolean neutral) throws Exception {
    String asset=canonical(id);
    if(!Set.of("markdown","json").contains(format))throw new IllegalArgumentException("Invalid format");
    Reply authorized=assets.asset(who,asset);
    if(authorized.code()!=Code.OK)return authorized;
    return assets.parsed(who,asset,format,neutral);
  }
  private String canonical(String id) {
    String canonical=UUID.fromString(id).toString();
    if(!canonical.equalsIgnoreCase(id))throw new IllegalArgumentException("Invalid UUID");
    return canonical;
  }
}
