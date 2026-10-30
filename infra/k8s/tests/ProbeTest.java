import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.net.ServerSocket;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.common.KafkaFuture;
import org.apache.kafka.common.TopicPartition;
import org.junit.jupiter.api.Test;

class ProbeTest {
  @Test void networkChecksActualConnectivityAndRefusal() throws Exception {
    try (var socket = new ServerSocket(0)) {
      String open = "127.0.0.1:" + socket.getLocalPort();
      assertTrue(NetworkCheck.check(true, open));
      assertFalse(NetworkCheck.check(false, open));
      NetworkCheck.main(new String[]{"allow", open});
    }
    int closed;
    try (var socket = new ServerSocket(0)) { closed = socket.getLocalPort(); }
    assertTrue(NetworkCheck.check(false, "127.0.0.1:" + closed));
    assertFalse(NetworkCheck.check(true, "127.0.0.1:" + closed));
    assertThrows(Exception.class, () -> NetworkCheck.check(false, "invalid.invalid:5432"));
  }
  @Test void workerMainDelegatesToReadiness() {
    try (var probe = mockStatic(WorkerReady.class)) {
      probe.when(() -> WorkerReady.ready(nullable(String.class), nullable(String.class), nullable(String.class), nullable(String.class))).thenReturn(true);
      probe.when(() -> WorkerReady.main(any(String[].class))).thenCallRealMethod();
      WorkerReady.main(new String[0]);
    }
  }
  @Test void readinessRequiresDatabaseAndThisWorkersAssignment() throws Exception {
    try (var driver = mockStatic(DriverManager.class); var factory = mockStatic(AdminClient.class)) {
      var db = mock(Connection.class);
      var admin = mock(AdminClient.class);
      driver.when(() -> DriverManager.getConnection("jdbc:fixture", "worker_owner", "synthetic")).thenReturn(db);
      factory.when(() -> AdminClient.create(any(Properties.class))).thenReturn(admin);
      var result = mock(DescribeConsumerGroupsResult.class);
      var group = mock(ConsumerGroupDescription.class);
      var member = mock(MemberDescription.class);
      var assignment = mock(MemberAssignment.class);
      when(admin.describeConsumerGroups(anyCollection())).thenReturn(result);
      when(result.all()).thenReturn(KafkaFuture.completedFuture(Map.of("worker-inputs-v1", group)));
      when(group.members()).thenReturn(List.of(member));
      when(member.clientId()).thenReturn("pod-0");
      when(member.assignment()).thenReturn(assignment);
      when(assignment.topicPartitions()).thenReturn(Set.of(new TopicPartition("asset.uploaded.v1", 0)));
      when(db.isValid(2)).thenReturn(true);
      assertTrue(WorkerReady.ready("jdbc:fixture", "synthetic", "kafka:19092", "pod"));
      assertFalse(WorkerReady.ready("jdbc:fixture", "synthetic", "kafka:19092", "another"));
      when(assignment.topicPartitions()).thenReturn(Set.of());
      assertFalse(WorkerReady.ready("jdbc:fixture", "synthetic", "kafka:19092", "pod"));
      when(db.isValid(2)).thenReturn(false);
      assertFalse(WorkerReady.ready("jdbc:fixture", "synthetic", "kafka:19092", "pod"));
      var outage = new java.sql.SQLException("synthetic outage");
      when(db.isValid(2)).thenThrow(outage);
      assertFalse(WorkerReady.ready("jdbc:fixture", "synthetic", "kafka:19092", "pod"));
    }
  }
}
