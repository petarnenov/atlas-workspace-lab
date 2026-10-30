import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;

/** Resolve DNS first: DNS failures never prove network-policy denial. */
public final class NetworkCheck {
  public static boolean check(boolean allow, String... endpoints) throws Exception {
    for (String endpoint : endpoints) {
      String[] parts = endpoint.split(":");
      var address = new InetSocketAddress(InetAddress.getByName(parts[0]), Integer.parseInt(parts[1]));
      boolean connected = false;
      try (var socket = new Socket()) { socket.connect(address, 2500); connected = true; }
      catch (java.io.IOException refused) { /* compare to expected connectivity */ }
      if (connected != allow) return false;
    }
    return true;
  }
  public static void main(String[] args) throws Exception {
    if (!check(args[0].equals("allow"), java.util.Arrays.copyOfRange(args, 1, args.length))) System.exit(1);
  }
}
