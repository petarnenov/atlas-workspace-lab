package dev.atlaslab.assets.adapters.out;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import dev.atlaslab.assets.ports.*;
import java.sql.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;

public final class JdbcArtifacts implements ArtifactCatalog,ArtifactMaintenance {
  private final JdbcTemplate db;
  private final AssetPersistence ownership;
  public JdbcArtifacts(JdbcTemplate db,AssetPersistence ownership) { this.db=db;this.ownership=ownership; }
  public <T> T withStagingOwnership(String tenant,Supplier<T> operation) {
    return ownership.withUploadOwnership("derived-artifact:"+tenant,operation);
  }
  public Binding binding(String tenant,String asset) {
    var rows=db.query("SELECT i.digest,a.correlation_id,o.event_id,a.status FROM asset a JOIN upload_intent i ON i.asset_id=a.asset_id JOIN upload_outbox o ON o.asset_id=a.asset_id WHERE a.tenant_id=?::uuid AND a.asset_id=?::uuid",
      (rs,n)->new Binding(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4)),tenant,asset);
    return rows.isEmpty()?null:rows.getFirst();
  }
  private Manifest manifest(ResultSet rs,int index) throws SQLException {
    var document=new Document("",null,rs.getString("converter_revision"),rs.getString("pipeline_revision"),rs.getInt("page_count"));
    var stage=new Stage(rs.getString("tenant_id"),rs.getString("asset_id"),rs.getString("input_event_id"),rs.getString("correlation_id"),rs.getString("source_sha256"),rs.getLong("attempt_fence"),rs.getString("idem_key"),document);
    return new Manifest(rs.getString("artifact_id"),stage,rs.getString("payload_hash"),rs.getString("markdown_hash"),rs.getString("native_hash"),rs.getString("state"));
  }
  public Manifest byKey(String tenant,String key) {
    var rows=db.query("SELECT * FROM derived_artifact WHERE tenant_id=?::uuid AND idem_key=?::uuid",this::manifest,tenant,key);
    return rows.isEmpty()?null:rows.getFirst();
  }
  public Manifest byId(String tenant,String asset,String artifact) {
    var rows=db.query("SELECT * FROM derived_artifact WHERE tenant_id=?::uuid AND asset_id=?::uuid AND artifact_id=?::uuid",this::manifest,tenant,asset,artifact);
    return rows.isEmpty()?null:rows.getFirst();
  }
  public Manifest committed(String tenant,String asset) {
    var rows=db.query("SELECT d.* FROM derived_artifact d JOIN asset a ON d.asset_id=a.asset_id AND d.tenant_id=a.tenant_id WHERE d.tenant_id=?::uuid AND d.asset_id=?::uuid AND d.state='COMMITTED' AND a.status='COMPLETED'",this::manifest,tenant,asset);
    return rows.isEmpty()?null:rows.getFirst();
  }
  public int pendingCount(String tenant) {
    return db.queryForObject("SELECT count(*) FROM derived_artifact WHERE tenant_id=?::uuid AND state<>'COMMITTED'",Integer.class,tenant);
  }
  public void reserve(Manifest manifest) {
    Stage stage=manifest.stage();Document document=stage.document();
    db.update("INSERT INTO derived_artifact(tenant_id,artifact_id,asset_id,input_event_id,correlation_id,source_sha256,attempt_fence,idem_key,payload_hash,markdown_hash,native_hash,converter_revision,pipeline_revision,page_count,state) VALUES(?::uuid,?::uuid,?::uuid,?::uuid,?::uuid,?,?,?::uuid,?,?,?,?,?,?,'WRITING')",
      stage.tenant(),manifest.artifactId(),stage.assetId(),stage.inputEventId(),stage.correlationId(),stage.sourceHash(),stage.fence(),stage.key(),manifest.payloadHash(),manifest.markdownHash(),manifest.nativeHash(),document.converter(),document.pipeline(),document.pages());
  }
  public void staged(String tenant,String artifact) {
    if(db.update("UPDATE derived_artifact SET state='STAGED' WHERE tenant_id=?::uuid AND artifact_id=?::uuid AND state='WRITING'",tenant,artifact)!=1)throw new Failure(Failure.Kind.UNAVAILABLE);
  }
  public java.util.List<Manifest> committedBatch(int maximum) {
    return db.query("SELECT * FROM derived_artifact WHERE state='COMMITTED' ORDER BY tenant_id,asset_id LIMIT ?",this::manifest,maximum);
  }
  public void commitImported(Manifest manifest) {
    Stage stage=manifest.stage();
    if(db.update("UPDATE derived_artifact d SET state='COMMITTED' FROM asset a WHERE d.tenant_id=?::uuid AND d.asset_id=?::uuid AND d.artifact_id=?::uuid AND d.state IN ('WRITING','STAGED') AND a.tenant_id=d.tenant_id AND a.asset_id=d.asset_id AND a.status='COMPLETED'",stage.tenant(),stage.assetId(),manifest.artifactId())!=1)throw new Failure(Failure.Kind.CONFLICT);
  }
}
