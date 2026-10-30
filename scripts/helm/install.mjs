import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  cpSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execute } from "../k8s/runtime.mjs";
export async function installHelm({
  platform = process.platform,
  architecture = process.arch,
  fetcher = fetch,
  run = execute,
  pins = JSON.parse(readFileSync("infra/helm/versions.json")),
} = {}) {
  const arch = { x64: "amd64", arm64: "arm64" }[architecture];
  if (!arch || !["linux", "darwin"].includes(platform))
    throw Error("Unsupported Helm platform");
  const distribution = `${platform}-${arch}`;
  const response = await fetcher(
    `https://get.helm.sh/helm-v${pins.helm}-${distribution}.tar.gz`,
  );
  if (!response.ok) throw Error("Helm download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    createHash("sha256").update(bytes).digest("hex") !==
    pins.checksums[distribution]
  )
    throw Error("Helm checksum mismatch");
  const temp = mkdtempSync(resolve(tmpdir(), "atlas-helm-install-"));
  try {
    const archive = resolve(temp, "helm.tar.gz");
    writeFileSync(archive, bytes, { mode: 0o600 });
    run("tar", ["-xzf", archive, "-C", temp, `${distribution}/helm`]);
    mkdirSync(".local/tools", { recursive: true, mode: 0o700 });
    cpSync(resolve(temp, distribution, "helm"), ".local/tools/helm");
    chmodSync(".local/tools/helm", 0o755);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  console.log(
    `Installed verified Helm ${pins.helm} under ignored .local/tools.`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await installHelm();
