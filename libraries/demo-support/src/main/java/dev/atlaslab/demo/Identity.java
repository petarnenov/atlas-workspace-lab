package dev.atlaslab.demo;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jwt.*;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.*;
import java.security.spec.*;
import java.time.*;
import java.util.*;

/** Synthetic local identity; not a production identity provider. */
public final class Identity {
  public static final Set<String> TENANTS =
      Set.of("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");

  public record Context(String tenant, String subject) {}

  private final RSAPublicKey publicKey;
  private final String issuer;
  private final String audience;
  private final long maxSeconds;

  public Identity(String path, String issuer, String audience, long maxSeconds) {
    this.publicKey = (RSAPublicKey) key(path, false);
    this.issuer = issuer;
    this.audience = audience;
    this.maxSeconds = maxSeconds;
  }

  public Context verify(String authorization) {
    try {
      if (authorization == null
          || !authorization.startsWith("Bearer ")
          || authorization.length() > 8192) throw new IllegalArgumentException();
      SignedJWT jwt = SignedJWT.parse(authorization.substring(7));
      if (!JWSAlgorithm.RS256.equals(jwt.getHeader().getAlgorithm())
          || !jwt.verify(new RSASSAVerifier(publicKey))) throw new IllegalArgumentException();
      JWTClaimsSet c = jwt.getJWTClaimsSet();
      Instant now = Instant.now();
      if (!issuer.equals(c.getIssuer())
          || !List.of(audience).equals(c.getAudience())
          || c.getExpirationTime() == null
          || c.getNotBeforeTime() == null
          || c.getIssueTime() == null) throw new IllegalArgumentException();
      Instant exp = c.getExpirationTime().toInstant(),
          issued = c.getIssueTime().toInstant(),
          nbf = c.getNotBeforeTime().toInstant();
      if (!exp.isAfter(now)
          || nbf.isAfter(now)
          || issued.isAfter(now)
          || !exp.isAfter(issued)
          || exp.isAfter(issued.plusSeconds(maxSeconds))) throw new IllegalArgumentException();
      String tenant = c.getStringClaim("tenantId"), subject = c.getSubject();
      if (!TENANTS.contains(tenant)
          || subject == null
          || subject.isBlank()
          || subject.length() > 128) throw new IllegalArgumentException();
      return new Context(tenant, subject);
    } catch (Exception e) {
      throw new HttpFailure(401, "UNAUTHORIZED", "Valid synthetic identity required");
    }
  }

  public static String issue(
      Context context, String path, String issuer, String audience, long seconds) {
    try {
      Instant now = Instant.now();
      JWTClaimsSet c =
          new JWTClaimsSet.Builder()
              .issuer(issuer)
              .audience(audience)
              .subject(context.subject())
              .claim("tenantId", context.tenant())
              .issueTime(Date.from(now))
              .notBeforeTime(Date.from(now))
              .expirationTime(Date.from(now.plusSeconds(seconds)))
              .build();
      SignedJWT jwt =
          new SignedJWT(
              new JWSHeader.Builder(JWSAlgorithm.RS256).type(JOSEObjectType.JWT).build(), c);
      jwt.sign(new RSASSASigner((RSAPrivateKey) key(path, true)));
      return jwt.serialize();
    } catch (Exception e) {
      throw new IllegalStateException("Local signing unavailable", e);
    }
  }

  private static Key key(String path, boolean secret) {
    try {
      String pem =
          Files.readString(Path.of(path)).replaceAll("-----[^-]+-----", "").replaceAll("\\s", "");
      byte[] bytes = Base64.getDecoder().decode(pem);
      KeyFactory factory = KeyFactory.getInstance("RSA");
      return secret
          ? factory.generatePrivate(new PKCS8EncodedKeySpec(bytes))
          : factory.generatePublic(new X509EncodedKeySpec(bytes));
    } catch (Exception e) {
      throw new IllegalStateException("Local key unavailable", e);
    }
  }
}
