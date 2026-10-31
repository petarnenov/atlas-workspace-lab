package dev.atlaslab.worker.bootstrap;

import dev.atlaslab.worker.*;
import dev.atlaslab.worker.application.ProcessingKernel;
import dev.atlaslab.worker.adapters.out.*;
import dev.atlaslab.demo.*;
import java.util.concurrent.TimeUnit;
import org.springframework.kafka.core.KafkaTemplate;

/** Compatibility binding during consumer-first rollout; replaced only at bootstrap. */
public final class WorkerAssembly {
  private WorkerAssembly() {}
  public static WorkerEvents createPortable(Checkpoints checkpoints,ObjectsStore sources,Sandbox sandbox,
      ParserClient parser,KafkaTemplate<String,String> kafka,String assets,String signingKey) {
    var state=new JdbcExecutionState(checkpoints,true);
    return new WorkerEvents(new ProcessingKernel(state,sources::get,sandbox::inspect,parser,
      new ArtifactCompletionClient(assets,signingKey,state),new RenewingOwnership(state,15000),new KafkaOutcomePublisher(kafka),new ProcessingLog()));
  }
  public static WorkerEvents create(Checkpoints checkpoints,ObjectsStore sources,Sandbox sandbox,
      ParserClient parser,KafkaTemplate<String,String> kafka) {
    return create(checkpoints,sources,sandbox,parser,kafka,15000);
  }
  public static WorkerEvents create(Checkpoints checkpoints,ObjectsStore sources,Sandbox sandbox,
      ParserClient parser,KafkaTemplate<String,String> kafka,long renewalMillis) {
    var state=new JdbcExecutionState(checkpoints);
    var kernel=new ProcessingKernel(state,sources::get,sandbox::inspect,parser,state::completeLegacy,
      new RenewingOwnership(state,renewalMillis),
      publication->kafka.send("asset.processed.v1",publication.assetId(),publication.payload()).get(6,TimeUnit.SECONDS),new ProcessingLog());
    return new WorkerEvents(kernel);
  }
}
