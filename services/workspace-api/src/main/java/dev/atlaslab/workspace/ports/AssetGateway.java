package dev.atlaslab.workspace.ports;
import dev.atlaslab.workspace.domain.WorkspaceModel.*;
public interface AssetGateway {
  Reply upload(Actor who,String key,byte[] bytes) throws Exception;
  Reply asset(Actor who,String id) throws Exception;
  Reply parsed(Actor who,String id,String format,boolean neutral) throws Exception;
}
