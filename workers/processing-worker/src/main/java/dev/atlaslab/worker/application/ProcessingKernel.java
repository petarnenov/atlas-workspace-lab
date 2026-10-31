package dev.atlaslab.worker.application;

import dev.atlaslab.worker.domain.WorkModel.*;
import dev.atlaslab.worker.ports.ProcessingPorts.*;
import java.util.Set;
import java.nio.charset.StandardCharsets;
import dev.atlaslab.demo.PdfUpload;

/** Small processing kernel; every external effect is an application-owned port. */
public final class ProcessingKernel {
  private static final Set<String> ERRORS=Set.of("INVALID_DOCUMENT","PROCESSING_ERROR","RETRY_EXHAUSTED");
  private final ExecutionState state;
  private final Source source;
  private final PdfValidation validation;
  private final DocumentParser parser;
  private final Completion completion;
  private final LeaseMonitor monitor;
  private final Publisher publisher;
  private final Trace trace;
  public ProcessingKernel(ExecutionState state,Source source,PdfValidation validation,
      DocumentParser parser,Completion completion,LeaseMonitor monitor,Publisher publisher,Trace trace) {
    this.state=state;this.source=source;this.validation=validation;this.parser=parser;
    this.completion=completion;this.monitor=monitor;this.publisher=publisher;this.trace=trace;
  }
  public void accept(Work input) {
    if(!input.reference().matches("[0-9a-f-]{36}\\.pdf")) {
      state.finding(input.eventId(),"UNSAFE_OBJECT_KEY");return;
    }
    state.accept(input);
  }
  public void invalidInput() { state.finding(null,"INVALID_EVENT"); }
  public void process() {
    Lease lease=state.claim();
    if(lease==null)return;
    Work input=lease.work();
    record("processing_started",lease,null,null);
    if(lease.attempt()>3) { fail(lease,"RETRY_EXHAUSTED");return; }
    boolean parsing=false;
    try(Ownership ownership=monitor.watch(lease)) {
      try {
        byte[] bytes=source.read(input.reference());
        if(bytes==null||bytes.length==0||bytes.length>5*1024*1024) { fail(lease,"INVALID_DOCUMENT");return; }
        String error=validation.inspect(bytes);
        if(ownership.lost())return;
        if(error!=null) { fail(lease,error);return; }
        record("parser_started",lease,null,null);parsing=true;
        Parsed parsed=parser.parse(bytes);
        if(ownership.lost())return;
        if(parsed==null||!PdfUpload.digest(bytes).equals(parsed.hash())||parsed.pages()<1||parsed.pages()>20
          ||parsed.markdown()==null||parsed.markdown().isBlank()||parsed.version()==null||parsed.version().isBlank()||parsed.version().length()>128
          ||parsed.pipeline()==null||parsed.pipeline().isBlank()||parsed.pipeline().length()>128
          ||parsed.markdown().getBytes(StandardCharsets.UTF_8).length+(parsed.nativeJson()==null?0:parsed.nativeJson().getBytes(StandardCharsets.UTF_8).length)>10*1024*1024)
          throw new DocumentParser.Rejected();
        if(completion.commit(lease,parsed)) {
          record("parser_saved",lease,null,null);
          record("outcome_saved",lease,"COMPLETED","NONE");
        } else record("outcome_not_saved",lease,null,"STALE_FENCE");
      } catch(DocumentParser.Rejected permanent) {
        if(!ownership.lost())fail(lease,"PROCESSING_ERROR");
      } catch(Exception unavailable) {
        if(ownership.lost())return;
        if(lease.attempt()>=3)fail(lease,"RETRY_EXHAUSTED");
        else {
          state.retry(lease);
          if(parsing)record("parser_retry",lease,null,null);
          record("retry_scheduled",lease,null,"DEPENDENCY_UNAVAILABLE");
        }
      }
    }
  }
  private void fail(Lease lease,String error) {
    String safe=ERRORS.contains(error)?error:"PROCESSING_ERROR";
    if(state.fail(lease,safe))record("outcome_saved",lease,"FAILED",safe);
    else record("outcome_not_saved",lease,null,"STALE_FENCE");
  }
  private void record(String action,Lease lease,String status,String error) {
    trace.record(action,lease.work(),lease.attempt(),status,error);
  }
  public void publish() {
    for(Publication publication:state.claimPublications()) {
      Work work=new Work(publication.eventId(),publication.assetId(),null,publication.correlationId(),null,null);
      try {
        publisher.publish(publication);state.sent(publication);
        trace.record("outcome_published",work,publication.attempt(),null,null);
      } catch(Exception unavailable) {
        state.publicationFailed(publication);
        trace.record(publication.attempt()>=3?"publication_exhausted":"publication_retry_scheduled",
          work,publication.attempt(),null,"BROKER_UNAVAILABLE");
      }
    }
  }
}
