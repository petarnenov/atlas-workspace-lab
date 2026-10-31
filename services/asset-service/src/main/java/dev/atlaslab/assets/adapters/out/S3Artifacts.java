package dev.atlaslab.assets.adapters.out;
import dev.atlaslab.assets.domain.ArtifactModel.*;
import dev.atlaslab.assets.ports.ArtifactStore;
import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;

/** Derived content uses a dedicated bucket/credential; never widen source access. */
public final class S3Artifacts implements ArtifactStore,AutoCloseable {
  private static final String BUCKET="synthetic-derived";
  private final S3Client client;
  public S3Artifacts(String endpoint,String password) {
    client=S3Client.builder().endpointOverride(URI.create(endpoint)).region(Region.US_EAST_1)
      .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("asset_artifacts",password)))
      .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
      .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(2)).socketTimeout(Duration.ofSeconds(5)))
      .overrideConfiguration(b->b.apiCallTimeout(Duration.ofSeconds(8)).apiCallAttemptTimeout(Duration.ofSeconds(6)).retryPolicy(r->r.numRetries(0))).build();
  }
  public S3Artifacts(S3Client client) { this.client=client; }
  private String key(Ref ref) {
    if(!java.util.UUID.fromString(ref.tenant()).toString().equals(ref.tenant())||!java.util.UUID.fromString(ref.artifactId()).toString().equals(ref.artifactId())
      ||!java.util.Set.of("markdown","native").contains(ref.variant()))throw new Failure(Failure.Kind.INVALID);
    return ref.tenant()+"/"+ref.artifactId()+"/"+ref.variant();
  }
  public void putIfAbsent(Ref ref,byte[] bytes,String mediaType) {
    if(bytes.length>10*1024*1024)throw new Failure(Failure.Kind.TOO_LARGE);
    try {
      client.putObject(PutObjectRequest.builder().bucket(BUCKET).key(key(ref)).ifNoneMatch("*").contentType(mediaType).build(),RequestBody.fromBytes(bytes));
    } catch(S3Exception exception) {
      if(exception.statusCode()!=412||!Arrays.equals(read(ref),bytes))throw new Failure(Failure.Kind.UNAVAILABLE);
    }
  }
  public byte[] read(Ref ref) {
    try(var stream=client.getObject(GetObjectRequest.builder().bucket(BUCKET).key(key(ref)).build())) {
      byte[] bytes=stream.readNBytes(10*1024*1024+1);
      if(bytes.length>10*1024*1024)throw new Failure(Failure.Kind.UNAVAILABLE);
      return bytes;
    } catch(Exception unavailable) { throw new Failure(Failure.Kind.UNAVAILABLE); }
  }
  public void close() { client.close(); }
}
