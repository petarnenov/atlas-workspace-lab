package dev.atlaslab.worker.adapters.out;

import dev.atlaslab.worker.domain.WorkModel.Work;
import dev.atlaslab.worker.ports.ProcessingPorts.Trace;
import org.slf4j.*;

public final class ProcessingLog implements Trace {
  private final Logger log=LoggerFactory.getLogger("dev.atlaslab.worker.WorkerEvents");
  public void record(String action,Work work,int attempt,String status,String error) {
    String base="{} eventId={} assetId={} correlationId={}";
    String suffix;Object[] values;
    if(status!=null) {
      suffix=" status={} errorCode={}";
      values=new Object[]{action,work.eventId(),work.assetId(),work.correlationId(),status,error};
    } else if(error!=null) {
      suffix=" attempt={} reason={}";
      values=new Object[]{action,work.eventId(),work.assetId(),work.correlationId(),attempt,error};
    } else {
      suffix=" attempt={}";
      values=new Object[]{action,work.eventId(),work.assetId(),work.correlationId(),attempt};
    }
    String template=base+suffix;
    if(action.contains("retry")||action.contains("exhausted")||action.equals("outcome_not_saved"))log.warn(template,values);
    else log.info(template,values);
  }
}
