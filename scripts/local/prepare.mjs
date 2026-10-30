import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
const dir = ".local";
mkdirSync(dir, { recursive: true, mode: 0o700 });
if (existsSync(".env"))
  throw new Error(
    "Existing .env preserved. Remove explicitly to regenerate a disposable environment.",
  );
const secrets = [
  "POSTGRES_ADMIN",
  "ASSET_DB",
  "WORKER_DB",
  "OBJECT_ADMIN",
  "ASSET_OBJECT",
  "WORKER_OBJECT",
];
writeFileSync(
  ".env",
  secrets
    .map((name) => `LAB_${name}_PASSWORD=${randomBytes(24).toString("hex")}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
for (const name of ["fixture", "service"]) {
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(`${dir}/${name}-private.pem`, keys.privateKey, { mode: 0o600 });
  writeFileSync(`${dir}/${name}-public.pem`, keys.publicKey, { mode: 0o600 });
}
console.log(
  "Generated ephemeral local-only credentials and signing keys. Never upload .env or .local.",
);
