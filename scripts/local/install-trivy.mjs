import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const version = "0.76.1";
const prefix = `https://github.com/aquasecurity/trivy/releases/download/v${version}`;
const checksums = Buffer.from(
  await (await fetch(`${prefix}/trivy_${version}_checksums.txt`)).arrayBuffer(),
);
const digest = (b) => createHash("sha256").update(b).digest("hex");
if (
  digest(checksums) !==
  "885debc41b570179e81af560e5f393a66be29b9ff8c52915674f3eb2304c535d"
)
  throw new Error("Scanner checksum manifest mismatch");
const platform =
  process.platform === "darwin"
    ? "macOS"
    : process.platform === "linux"
      ? "Linux"
      : null;
const arch =
  process.arch === "x64" ? "64bit" : process.arch === "arm64" ? "ARM64" : null;
if (!platform || !arch) throw new Error("Unsupported scanner platform");
const name = `trivy_${version}_${platform}-${arch}.tar.gz`;
const expected = checksums
  .toString()
  .split("\n")
  .find((line) => line.trim().endsWith(name))
  ?.trim()
  .split(/\s+/)[0];
if (!expected) throw new Error("Missing scanner checksum");
const archive = Buffer.from(
  await (await fetch(`${prefix}/${name}`)).arrayBuffer(),
);
if (digest(archive) !== expected) throw new Error("Scanner archive mismatch");
mkdirSync(".local/tools", { recursive: true });
writeFileSync(".local/tools/trivy.tar.gz", archive);
execFileSync("tar", [
  "-xzf",
  ".local/tools/trivy.tar.gz",
  "-C",
  ".local/tools",
  "trivy",
]);
console.log(`Verified official Trivy ${version}.`);
