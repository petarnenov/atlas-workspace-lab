package dev.atlaslab.assets.bootstrap;
import dev.atlaslab.assets.adapters.out.*;
import dev.atlaslab.assets.application.ParsedArtifacts;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import dev.atlaslab.demo.adapters.out.MaintenanceFiles;
import dev.atlaslab.demo.Wire;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;

/** Separate dev maintenance process; only asset-owned database and scoped objects. */
public final class AssetMaintenance {
 public static void main(String[] args) throws Exception { run(args,System.getenv()); }
 public static void run(String[] args,Map<String,String> env) throws Exception {
  if(!"dev".equals(env.getOrDefault("ENV","dev"))||!"1".equals(env.get("ATLAS_MAINTENANCE_PAUSED")))throw new IllegalStateException("Dev maintenance requires an explicit paused window");
  if(args.length!=2)throw new IllegalArgumentException("Expected action and private file path");
  var ds=new DriverManagerDataSource(env.getOrDefault("ASSET_DB_URL","jdbc:postgresql://localhost:5432/assets"),"asset_owner",env.get("LAB_ASSET_DB_PASSWORD"));
  var db=new JdbcTemplate(ds);var archive=new JdbcArtifactArchive(db);archive.requireDrained();
  var persistence=new JdbcAssets(db,new DataSourceTransactionManager(ds));var catalog=new JdbcArtifacts(db,persistence);
  var file=Path.of(args[1]);
  try(var content=new S3Artifacts(env.getOrDefault("LAB_OBJECT_ENDPOINT","http://localhost:9000"),env.get("LAB_ARTIFACT_OBJECT_PASSWORD"))) {
   var app=new ParsedArtifacts(catalog,content);
   switch(args[0]) {
    case "snapshot" -> MaintenanceFiles.write(file,"asset-manifests",archive.snapshot());
    case "import" -> {
     var copies=new ArrayList<MaintenanceFiles.Copy>();
     for(var row:MaintenanceFiles.read(file,"worker-copies"))copies.add(MaintenanceFiles.copy(row));
     for(var c:copies) {
      var key=UUID.nameUUIDFromBytes(("legacy-migration:"+c.tenantId()+":"+c.inputEventId()).getBytes(StandardCharsets.UTF_8)).toString();
      var stage=new Stage(c.tenantId(),c.assetId(),c.inputEventId(),c.correlationId(),c.sourceSha256(),c.fence(),key,new Document(c.markdown(),c.nativeJson(),c.converter(),c.pipeline(),c.pageCount()));
      app.importLegacy(stage,MaintenanceFiles.hash(Wire.json(c)),catalog);
     }
    }
    case "export" -> {
     var manifests=catalog.committedBatch(1001);
     if(manifests.size()>1000)throw new IllegalStateException("Maintenance batch exceeds 1000");
     var copies=new ArrayList<MaintenanceFiles.Copy>();
     for(var manifest:manifests) {
      var s=manifest.stage();var d=s.document();
      var markdown=app.read(s.tenant(),s.assetId(),"markdown",true);
      var nativeJson=manifest.nativeHash()==null?null:app.read(s.tenant(),s.assetId(),"json",false);
      copies.add(new MaintenanceFiles.Copy(s.tenant(),s.assetId(),s.inputEventId(),s.correlationId(),s.sourceHash(),d.converter(),d.pipeline(),d.pages(),s.fence(),manifest.artifactId(),markdown,nativeJson,manifest.markdownHash(),manifest.nativeHash()));
     }
     MaintenanceFiles.write(file,"asset-copies",copies);
    }
    default -> throw new IllegalArgumentException("Unknown asset maintenance action");
   }
  }
 }
}
