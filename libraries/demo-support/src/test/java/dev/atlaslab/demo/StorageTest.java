package dev.atlaslab.demo;

import static org.junit.jupiter.api.Assertions.*;

import java.net.*;
import java.net.http.*;
import java.util.*;
import org.junit.jupiter.api.*;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.S3Exception;

@Tag("integration")
class StorageTest {
  @Test
  void scopedIdentitiesCannotListOrReadAnotherBucket() {
    for (String user : List.of("asset_store", "worker_reader")) {
      String password =
          System.getenv(
              user.equals("asset_store")
                  ? "LAB_ASSET_OBJECT_PASSWORD"
                  : "LAB_WORKER_OBJECT_PASSWORD");
      try (var client =
          S3Client.builder()
              .endpointOverride(URI.create("http://localhost:9000"))
              .region(Region.US_EAST_1)
              .credentialsProvider(
                  StaticCredentialsProvider.create(AwsBasicCredentials.create(user, password)))
              .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
              .httpClientBuilder(UrlConnectionHttpClient.builder())
              .build()) {
        assertEquals(403, assertThrows(S3Exception.class, client::listBuckets).statusCode());
        assertEquals(
            403,
            assertThrows(
                    S3Exception.class,
                    () -> client.listObjectsV2(b -> b.bucket("synthetic-assets")))
                .statusCode());
        assertEquals(
            403,
            assertThrows(
                    S3Exception.class,
                    () ->
                        client.getObject(b -> b.bucket("other-synthetic-bucket").key("sample.pdf")))
                .statusCode());
      }
    }
  }

  @Test
  void realS3LifecycleAndLeastPrivilege() throws Exception {
    String key = UUID.randomUUID() + ".pdf";
    byte[] bytes = "%PDF-1.7 synthetic-storage-test".getBytes();
    try (var asset =
            new ObjectsStore(
                "http://localhost:9000",
                "asset_store",
                System.getenv("LAB_ASSET_OBJECT_PASSWORD"));
        var worker =
            new ObjectsStore(
                "http://localhost:9000",
                "worker_reader",
                System.getenv("LAB_WORKER_OBJECT_PASSWORD"))) {
      asset.put(key, bytes);
      assertArrayEquals(bytes, worker.get(key));
      assertArrayEquals(bytes, asset.get(key));
      assertThrows(Exception.class, () -> worker.put(key, new byte[] {1}));
      assertThrows(Exception.class, () -> worker.delete(key));
      assertArrayEquals(bytes, asset.get(key));
      var response =
          HttpClient.newHttpClient()
              .send(
                  HttpRequest.newBuilder(
                          URI.create("http://localhost:9000/synthetic-assets/" + key))
                      .GET()
                      .build(),
                  HttpResponse.BodyHandlers.ofString());
      assertEquals(403, response.statusCode());
      assertFalse(response.body().contains("synthetic-storage-test"));
      asset.delete(key);
      assertThrows(Exception.class, () -> worker.get(key));
      asset.put(key, new byte[ObjectsStore.MAX_BYTES + 1]);
      assertThrows(java.io.IOException.class, () -> worker.get(key));
      asset.delete(key);
    }
  }
}
