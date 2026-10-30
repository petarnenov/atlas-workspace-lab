package dev.atlaslab.demo;

import java.io.*;
import java.net.URI;
import java.time.Duration;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;

/** Standard S3 client; the local storage product is independently replaceable. */
public class ObjectsStore implements AutoCloseable {
  public static final int MAX_BYTES = 5 * 1024 * 1024;
  private final S3Client client;
  private static final String BUCKET = "synthetic-assets";

  public ObjectsStore(String endpoint, String user, String password) {
    client =
        S3Client.builder()
            .endpointOverride(URI.create(endpoint))
            .region(Region.US_EAST_1)
            .credentialsProvider(
                StaticCredentialsProvider.create(AwsBasicCredentials.create(user, password)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
            .httpClientBuilder(
                UrlConnectionHttpClient.builder()
                    .connectionTimeout(Duration.ofSeconds(2))
                    .socketTimeout(Duration.ofSeconds(5)))
            .overrideConfiguration(
                ClientOverrideConfiguration.builder()
                    .apiCallTimeout(Duration.ofSeconds(8))
                    .apiCallAttemptTimeout(Duration.ofSeconds(6))
                    .retryPolicy(b -> b.numRetries(0))
                    .build())
            .build();
  }

  public void put(String key, byte[] data) {
    client.putObject(
        PutObjectRequest.builder().bucket(BUCKET).key(key).contentType("application/pdf").build(),
        RequestBody.fromBytes(data));
  }

  public byte[] get(String key) throws IOException {
    try (ResponseInputStream<GetObjectResponse> in =
        client.getObject(GetObjectRequest.builder().bucket(BUCKET).key(key).build())) {
      byte[] bytes = in.readNBytes(MAX_BYTES + 1);
      if (bytes.length > MAX_BYTES) throw new IOException("Object too large");
      return bytes;
    }
  }

  public void delete(String key) {
    client.deleteObject(DeleteObjectRequest.builder().bucket(BUCKET).key(key).build());
  }

  public void close() {
    client.close();
  }
}
