package dev.atlaslab.worker.adapters.out;

import dev.atlaslab.worker.domain.WorkModel.Lease;
import dev.atlaslab.worker.ports.ProcessingPorts.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Cancels the processing thread when ownership cannot be verified. */
public final class RenewingOwnership implements LeaseMonitor {
  private final ExecutionState state;
  private final long interval;
  public RenewingOwnership(ExecutionState state,long interval) {
    if(interval<=0)throw new IllegalArgumentException("Positive renewal interval required");
    this.state=state;this.interval=interval;
  }
  public Ownership watch(Lease lease) {
    var lost=new AtomicBoolean();var active=new AtomicBoolean(true);
    Object lock=new Object();Thread processing=Thread.currentThread();
    var executor=Executors.newSingleThreadScheduledExecutor();
    executor.scheduleAtFixedRate(()->{
      synchronized(lock) {
        if(!active.get())return;
        try { if(state.renew(lease))return; } catch(Exception unavailable) { /* Fail closed. */ }
        lost.set(true);processing.interrupt();
      }
    },interval,interval,TimeUnit.MILLISECONDS);
    return new Ownership() {
      public boolean lost() { return lost.get(); }
      public void close() {
        synchronized(lock) { active.set(false);if(lost.get())Thread.interrupted(); }
        executor.shutdownNow();
      }
    };
  }
}
