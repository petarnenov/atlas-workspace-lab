import { readFileSync } from "node:fs";
import { sign } from "node:crypto";
const tenant =
  process.argv[2] === "b"
    ? "22222222-2222-4222-8222-222222222222"
    : "11111111-1111-4111-8111-111111111111";
const now = Math.floor(Date.now() / 1000);
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const input = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: "lab-fixture", aud: "workspace-api", sub: "synthetic-user", tenantId: tenant, iat: now, nbf: now, exp: now + 300 })}`;
console.log(
  `${input}.${sign("RSA-SHA256", Buffer.from(input), readFileSync(".local/fixture-private.pem")).toString("base64url")}`,
);
