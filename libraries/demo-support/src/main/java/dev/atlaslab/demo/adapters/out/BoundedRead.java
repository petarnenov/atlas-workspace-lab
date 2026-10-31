package dev.atlaslab.demo.adapters.out;
import java.io.*;
import java.time.Duration;
import java.util.concurrent.*;
/** Bounds both response bytes and time after HTTP headers arrive. */
public final class BoundedRead {
  private BoundedRead() {}
  public static byte[] read(InputStream stream,int maximum,Duration timeout) throws Exception {
    var executor=Executors.newVirtualThreadPerTaskExecutor();
    var pending=executor.submit(()->stream.readNBytes(maximum+1));
    try {
      byte[] bytes=pending.get(timeout.toMillis(),TimeUnit.MILLISECONDS);
      if(bytes.length>maximum)throw new IOException("Response exceeds bound");
      return bytes;
    } finally { stream.close();pending.cancel(true);executor.shutdownNow(); }
  }
}
