package dev.atlaslab.worker.adapters.out;

import dev.atlaslab.worker.Checkpoints;
import dev.atlaslab.worker.domain.WorkModel.*;
import dev.atlaslab.worker.ports.ProcessingPorts.ExecutionState;
import dev.atlaslab.demo.Wire;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Typed application port over the existing durable SQL ledger. */
public final class JdbcExecutionState implements ExecutionState {
  private final Checkpoints checkpoints;
  private final boolean portable;
  public JdbcExecutionState(Checkpoints checkpoints) { this(checkpoints,false); }
  public JdbcExecutionState(Checkpoints checkpoints,boolean portable) { this.checkpoints=checkpoints;this.portable=portable; }
  public static Work work(Wire.Event e) {
    return new Work(e.eventId(),e.assetId(),e.tenantId(),e.correlationId(),e.objectKey(),e.occurredAt());
  }
  public static Wire.Event event(Work work) {
    return new Wire.Event(work.eventId(),work.assetId(),work.tenantId(),"1",work.occurredAt(),work.correlationId(),work.reference(),null,null);
  }
  public static Map<String,Object> token(Lease lease) {
    return Map.of("event_id",lease.work().eventId(),"fence",lease.fence(),"attempts",lease.attempt(),"input_payload",Wire.json(event(lease.work())));
  }
  public void accept(Work work) { checkpoints.accept(Wire.json(event(work))); }
  public void finding(String event,String reason) { checkpoints.recordFinding(event,reason); }
  public Lease claim() {
    var row=checkpoints.claim();if(row==null)return null;
    Work work=work(Wire.event(row.get("input_payload").toString(),true));
    long fence=((Number)row.get("fence")).longValue();
    String stageKey=UUID.nameUUIDFromBytes((work.eventId()+":"+fence).getBytes(StandardCharsets.UTF_8)).toString();
    return new Lease(work,((Number)row.get("attempts")).intValue(),fence,stageKey);
  }
  public boolean renew(Lease lease) { return checkpoints.renew(token(lease)); }
  public boolean fail(Lease lease,String error) { return portable?checkpoints.finishV2(token(lease),event(lease.work()),null,error):checkpoints.finish(token(lease),Wire.outcome(event(lease.work()),error)); }
  public void retry(Lease lease) { checkpoints.retry(token(lease)); }
  public boolean completeLegacy(Lease lease,Parsed parsed) {
    return checkpoints.finishParsed(token(lease),event(lease.work()),parsed);
  }
  public boolean completeReference(Lease lease,String artifactId) {
    return checkpoints.finishV2(token(lease),event(lease.work()),artifactId,null);
  }
  public List<Publication> claimPublications() { return checkpoints.claimPublications(); }
  public void sent(Publication publication) { checkpoints.sent(publication.eventId()); }
  public void publicationFailed(Publication publication) { checkpoints.publicationFailed(publication.eventId()); }
}
