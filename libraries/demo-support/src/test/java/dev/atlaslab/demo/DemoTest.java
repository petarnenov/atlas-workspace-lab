package dev.atlaslab.demo;

import static org.junit.jupiter.api.Assertions.*;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.*;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPrivateKey;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class DemoTest {
  @TempDir Path temp;
  KeyPair keys;
  Path pub;
  Path secret;

  @BeforeEach
  void keys() throws Exception {
    keys = KeyPairGenerator.getInstance("RSA").generateKeyPair();
    pub = temp.resolve("public.pem");
    secret = temp.resolve("private.pem");
    Files.writeString(pub, pem("PUBLIC", keys.getPublic().getEncoded()));
    Files.writeString(secret, pem("PRIVATE", keys.getPrivate().getEncoded()));
  }

  String pem(String type, byte[] data) {
    return "-----BEGIN "
        + type
        + " KEY-----\n"
        + Base64.getEncoder().encodeToString(data)
        + "\n-----END "
        + type
        + " KEY-----";
  }

  @Test
  void identityRoundtripAndTrustFailures() throws Exception {
    Identity.Context c = new Identity.Context(Identity.TENANTS.iterator().next(), "synthetic-user");
    String token = Identity.issue(c, secret.toString(), "lab-fixture", "workspace-api", 60);
    Identity verifier = new Identity(pub.toString(), "lab-fixture", "workspace-api", 300);
    assertEquals(c, verifier.verify("Bearer " + token));
    for (String bad :
        List.of("", token, "Bearer junk", "Bearer " + token.substring(0, token.length() - 5)))
      assertEquals(401, assertThrows(HttpFailure.class, () -> verifier.verify(bad)).status);
    assertThrows(HttpFailure.class, () -> verifier.verify(null));
    assertThrows(
        HttpFailure.class,
        () ->
            new Identity(pub.toString(), "other", "workspace-api", 300).verify("Bearer " + token));
    assertThrows(
        HttpFailure.class,
        () -> new Identity(pub.toString(), "lab-fixture", "other", 300).verify("Bearer " + token));
    assertThrows(
        HttpFailure.class,
        () ->
            new Identity(pub.toString(), "lab-fixture", "workspace-api", 30)
                .verify("Bearer " + token));
    assertThrows(
        HttpFailure.class,
        () ->
            verifier.verify(
                "Bearer "
                    + Identity.issue(c, secret.toString(), "lab-fixture", "workspace-api", -1)));
    assertThrows(
        HttpFailure.class,
        () ->
            verifier.verify(
                "Bearer "
                    + Identity.issue(
                        new Identity.Context(UUID.randomUUID().toString(), "user"),
                        secret.toString(),
                        "lab-fixture",
                        "workspace-api",
                        60)));
    assertThrows(
        HttpFailure.class,
        () ->
            verifier.verify(
                "Bearer "
                    + Identity.issue(
                        new Identity.Context(c.tenant(), " "),
                        secret.toString(),
                        "lab-fixture",
                        "workspace-api",
                        60)));
    JWTClaimsSet missing =
        new JWTClaimsSet.Builder()
            .issuer("lab-fixture")
            .audience("workspace-api")
            .subject("test")
            .build();
    SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), missing);
    jwt.sign(new RSASSASigner((RSAPrivateKey) keys.getPrivate()));
    assertThrows(HttpFailure.class, () -> verifier.verify("Bearer " + jwt.serialize()));
    assertThrows(IllegalStateException.class, () -> new Identity("missing", "a", "b", 30));
    assertThrows(IllegalStateException.class, () -> Identity.issue(c, "missing", "a", "b", 30));
  }

  @Test
  void pdfEnvelopeValidation() {
    byte[] good = "%PDF-1.7 synthetic".getBytes();
    PdfUpload.validate("../evil.PDF", "application/pdf", good);
    assertEquals(64, PdfUpload.digest(good).length());
    assertEquals(
        dev.atlaslab.demo.domain.Rejection.Kind.EMPTY_DOCUMENT,
        assertThrows(
                dev.atlaslab.demo.domain.Rejection.class,
                () -> PdfUpload.validate("a.pdf", "application/pdf", new byte[0]))
            .kind());
    assertEquals(
        dev.atlaslab.demo.domain.Rejection.Kind.TOO_LARGE,
        assertThrows(
                dev.atlaslab.demo.domain.Rejection.class,
                () ->
                    PdfUpload.validate(
                        "a.pdf", "application/pdf", new byte[ObjectsStore.MAX_BYTES + 1]))
            .kind());
    for (String name : Arrays.asList(null, "x.txt"))
      assertEquals(
          dev.atlaslab.demo.domain.Rejection.Kind.UNSUPPORTED_TYPE,
          assertThrows(dev.atlaslab.demo.domain.Rejection.class, () -> PdfUpload.validate(name, "application/pdf", good))
              .kind());
    assertEquals(
        dev.atlaslab.demo.domain.Rejection.Kind.UNSUPPORTED_TYPE,
        assertThrows(dev.atlaslab.demo.domain.Rejection.class, () -> PdfUpload.validate("a.pdf", "text/plain", good))
            .kind());
    assertEquals(
        dev.atlaslab.demo.domain.Rejection.Kind.INVALID_DOCUMENT,
        assertThrows(
                dev.atlaslab.demo.domain.Rejection.class,
                () -> PdfUpload.validate("a.pdf", "application/pdf", "not a pdf".getBytes()))
            .kind());
  }

  @Test
  void eventSchemasRejectUntrustedEnvelope() {
    Wire.Event e =
        Wire.uploaded(
            UUID.randomUUID().toString(),
            Identity.TENANTS.iterator().next(),
            UUID.randomUUID().toString(),
            UUID.randomUUID() + ".pdf");
    assertEquals(e, Wire.event(Wire.json(e), true));
    Wire.Event result = Wire.outcome(e, null);
    assertEquals("COMPLETED", Wire.event(Wire.json(result), false).outcome());
    assertEquals("FAILED", Wire.outcome(e, "INVALID_DOCUMENT").outcome());
    for (String invalid :
        List.of(
            "{}",
            "[]",
            "null",
            "bad",
            Wire.json(e).replace("\"schemaVersion\":\"1\"", "\"schemaVersion\":\"2\""),
            Wire.json(e).replace("\"objectKey\":", "\"unexpected\":"),
            Wire.json(e).replace(e.tenantId(), UUID.randomUUID().toString()),
            Wire.json(result).replace("COMPLETED", "PROCESSING")))
      assertThrows(IllegalArgumentException.class, () -> Wire.event(invalid, true));
    assertThrows(IllegalArgumentException.class, () -> Wire.uuid("1-1-1-1-1"));
    assertThrows(
        IllegalArgumentException.class,
        () -> Wire.event(Wire.json(Wire.outcome(e, "SECRET")), false));
    assertThrows(
        IllegalArgumentException.class,
        () -> Wire.event(Wire.json(result).replace("COMPLETED", "PENDING"), false));
  }

  @Test
  void errorResponsesAreSanitized() {
    Errors errors = new Errors();
    assertEquals(
        401,
        errors.failure(new HttpFailure(401, "UNAUTHORIZED", "Denied")).getStatusCode().value());
    assertEquals(413, errors.size(new Exception()).getStatusCode().value());
    assertEquals(400, errors.bad(new Exception()).getStatusCode().value());
    assertFalse(
        errors.dependency(new Exception("raw secret")).getBody().toString().contains("raw secret"));
  }
}
