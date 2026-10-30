import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export async function installKind({
  tool = "kind",
  fetcher = fetch,
  platform = process.platform,
  architecture = process.arch,
  pins = JSON.parse(readFileSync("infra/k8s/versions.json")),
  mkdir = mkdirSync,
  write = writeFileSync,
} = {}) {
  if (!["kind", "kubectl"].includes(tool))
    throw Error("Unsupported Kubernetes tool");
  const arch = { x64: "amd64", arm64: "arm64" }[architecture];
  if (!arch || !["linux", "darwin"].includes(platform))
    throw Error("Unsupported kind platform");
  const name = `kind-${platform}-${arch}`;
  const url =
    tool === "kind"
      ? `https://github.com/kubernetes-sigs/kind/releases/download/v${pins.kind}/${name}`
      : `https://dl.k8s.io/release/v${pins.kubectl}/bin/${platform}/${arch}/kubectl`;
  const expected =
    tool === "kind"
      ? pins.kindChecksums[name]
      : pins.kubectlChecksums[`${platform}-${arch}`];
  const response = await fetcher(url);
  if (!response.ok) throw Error("kind download failed");
  const binary = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(binary).digest("hex") !== expected)
    throw Error("kind checksum mismatch");
  mkdir(".local/tools", { recursive: true, mode: 0o700 });
  write(`.local/tools/${tool}`, binary, { mode: 0o755 });
  console.log(
    `Installed verified ${tool} ${tool === "kind" ? pins.kind : pins.kubectl} under ignored .local/tools.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await installKind();
  await installKind({ tool: "kubectl" });
}
