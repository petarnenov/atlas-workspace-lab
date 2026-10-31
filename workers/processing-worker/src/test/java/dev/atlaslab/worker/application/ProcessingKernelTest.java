package dev.atlaslab.worker.application;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import dev.atlaslab.worker.domain.WorkModel.*;
import dev.atlaslab.worker.ports.ProcessingPorts.*;
import dev.atlaslab.demo.PdfUpload;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;

class ProcessingKernelTest {
  final byte[] pdf="%PDF-1.4 synthetic".getBytes();
  final Work work=new Work(UUID.randomUUID().toString(),UUID.randomUUID().toString(),"11111111-1111-4111-8111-111111111111",UUID.randomUUID().toString(),UUID.randomUUID()+".pdf","2026-10-31T00:00:00Z");
  final Lease lease=new Lease(work,1,1,UUID.randomUUID().toString());
  ExecutionState state;PdfValidation validation;Completion completion;Trace trace;Ownership ownership;
  @BeforeEach void setup() {
    state=mock(ExecutionState.class);validation=mock(PdfValidation.class);completion=mock(Completion.class);trace=mock(Trace.class);ownership=mock(Ownership.class);
    when(state.claim()).thenReturn(lease);
  }
  ProcessingKernel kernel(DocumentParser parser) {
    return new ProcessingKernel(state,reference->pdf,validation,parser,completion,ignored->ownership,publication->{},trace);
  }
  Parsed parsed(String revision,String nativeJson) { return new Parsed(PdfUpload.digest(pdf),revision,"fixture-pipeline",1,"portable text",nativeJson); }
  @Test void parserBindingChangesWithoutUseCaseChangesOrNativeDependency() throws Exception {
    var results=new ArrayList<Parsed>();
    when(completion.commit(any(),any())).thenAnswer(invocation->{results.add(invocation.getArgument(1));return true;});
    for(DocumentParser parser:List.<DocumentParser>of(bytes->parsed("first","{}"),bytes->parsed("alternate",null)))kernel(parser).process();
    assertEquals(2,results.size());assertEquals(results.getFirst().markdown(),results.getLast().markdown());assertNull(results.getLast().nativeJson());
    verify(completion,times(2)).commit(eq(lease),any());verify(ownership,times(2)).close();verify(state,never()).retry(any());
  }
  @Test void invalidPdfAndStaleOwnershipNeverStageOrCommit() throws Exception {
    var parser=mock(DocumentParser.class);
    when(validation.inspect(pdf)).thenReturn("INVALID_DOCUMENT");kernel(parser).process();
    verifyNoInteractions(parser,completion);
    when(validation.inspect(pdf)).thenReturn(null);when(ownership.lost()).thenReturn(true);kernel(parser).process();
    verifyNoInteractions(parser,completion);
  }
  @Test void malformedParserResultIsPermanentRegardlessOfProvider() throws Exception {
    for(Parsed invalid:Arrays.asList(null,new Parsed("forged","fixture","fixture",1,"text",null),
      new Parsed(PdfUpload.digest(pdf),"fixture","fixture",21,"text",null),
      new Parsed(PdfUpload.digest(pdf),"fixture","fixture",1," ",null)))kernel(bytes->invalid).process();
    verify(state,times(4)).fail(lease,"PROCESSING_ERROR");verifyNoInteractions(completion);verify(state,never()).retry(any());
  }
  @Test void completionAcknowledgementLossRetriesAndOutcomesRequireCurrentFence() throws Exception {
    when(completion.commit(any(),any())).thenThrow(new java.io.IOException("private"));
    kernel(bytes->parsed("fixture",null)).process();verify(state).retry(lease);
    reset(completion);when(completion.commit(any(),any())).thenReturn(false);
    kernel(bytes->parsed("fixture",null)).process();
    verify(trace).record("outcome_not_saved",work,1,null,"STALE_FENCE");
  }
  @Test void unsafeReferencesCannotEnterExecutionLedger() {
    kernel(bytes->parsed("fixture",null)).accept(new Work(work.eventId(),work.assetId(),work.tenantId(),work.correlationId(),"../../private",work.occurredAt()));
    verify(state).finding(work.eventId(),"UNSAFE_OBJECT_KEY");verify(state,never()).accept(any());
  }
}
