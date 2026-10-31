package dev.atlaslab.assets.application;
import dev.atlaslab.assets.Assets;
import dev.atlaslab.assets.domain.AssetModel.Outcome;
public final class CompleteAsset {
  private final Assets assets;
  private final ParsedArtifacts artifacts;
  public CompleteAsset(Assets assets,ParsedArtifacts artifacts) { this.assets=assets;this.artifacts=artifacts; }
  public void accept(Outcome outcome,String hash) {
    if(outcome.artifactId()!=null)artifacts.verifyOutcome(outcome.tenantId(),outcome.assetId(),outcome.artifactId(),outcome.inputEventId(),outcome.correlationId());
    assets.outcome(outcome,hash);
  }
}
