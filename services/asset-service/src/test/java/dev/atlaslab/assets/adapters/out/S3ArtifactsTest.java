package dev.atlaslab.assets.adapters.out;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import java.io.ByteArrayInputStream;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

class S3ArtifactsTest {
  final Ref reference=new Ref("11111111-1111-4111-8111-111111111111","00000000-0000-4000-8000-000000000001","markdown");
  S3Client client;S3Artifacts store;
  @BeforeEach void setup() { client=mock(S3Client.class);store=new S3Artifacts(client); }
  void body(byte[] bytes) {
    when(client.getObject(any(GetObjectRequest.class))).thenAnswer(invocation->new ResponseInputStream<>(GetObjectResponse.builder().build(),AbortableInputStream.create(new ByteArrayInputStream(bytes))));
  }
  @Test void immutablePutUsesOnlyDerivedBucketAndVerifiesConflictingRetry() {
    byte[] bytes="synthetic".getBytes();
    store.putIfAbsent(reference,bytes,"text/markdown");
    var request=ArgumentCaptor.forClass(PutObjectRequest.class);
    verify(client).putObject(request.capture(),any(RequestBody.class));
    assertEquals("synthetic-derived",request.getValue().bucket());assertEquals("*",request.getValue().ifNoneMatch());
    assertTrue(request.getValue().key().startsWith(reference.tenant()+"/"));
    when(client.putObject(any(PutObjectRequest.class),any(RequestBody.class))).thenThrow(S3Exception.builder().statusCode(412).build());
    body(bytes);assertDoesNotThrow(()->store.putIfAbsent(reference,bytes,"text/markdown"));
    body("different".getBytes());assertThrows(Failure.class,()->store.putIfAbsent(reference,bytes,"text/markdown"));
  }
  @Test void missingOversizedAndUnavailableContentCannotBeReturned() {
    when(client.getObject(any(GetObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(404).message("private").build());
    assertEquals("UNAVAILABLE",assertThrows(Failure.class,()->store.read(reference)).getMessage());
    body(new byte[10*1024*1024+1]);assertThrows(Failure.class,()->store.read(reference));
    assertThrows(Failure.class,()->store.putIfAbsent(reference,new byte[10*1024*1024+1],"text/markdown"));
    assertThrows(RuntimeException.class,()->store.putIfAbsent(new Ref(reference.tenant(),"../../private","native"),new byte[]{1},"application/json"));
    when(client.putObject(any(PutObjectRequest.class),any(RequestBody.class))).thenThrow(S3Exception.builder().statusCode(503).build());
    assertThrows(Failure.class,()->store.putIfAbsent(reference,new byte[]{1},"text/markdown"));
    store.close();verify(client).close();
  }
}
