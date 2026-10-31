package dev.atlaslab.worker.ports;

import dev.atlaslab.worker.domain.WorkModel.*;
import java.util.List;

public final class ProcessingPorts {
  private ProcessingPorts() {}
  public interface ExecutionState {
    void accept(Work work);
    void finding(String eventId,String reason);
    Lease claim();
    boolean renew(Lease lease);
    boolean fail(Lease lease,String error);
    void retry(Lease lease);
    List<Publication> claimPublications();
    void sent(Publication publication);
    void publicationFailed(Publication publication);
  }
  public interface Source { byte[] read(String reference) throws Exception; }
  public interface PdfValidation { String inspect(byte[] bytes) throws Exception; }
  public interface DocumentParser {
    Parsed parse(byte[] bytes) throws Exception;
    class Rejected extends Exception {}
  }
  public interface Completion { boolean commit(Lease lease,Parsed result) throws Exception; }
  public interface Publisher { void publish(Publication publication) throws Exception; }
  public interface Ownership extends AutoCloseable {
    boolean lost();
    @Override void close();
  }
  public interface LeaseMonitor { Ownership watch(Lease lease); }
  public interface Trace { void record(String action,Work work,int attempt,String status,String error); }
}
