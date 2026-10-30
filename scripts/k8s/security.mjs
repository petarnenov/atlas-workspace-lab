import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execute, rendered, root, versions } from "./runtime.mjs";
const images = JSON.parse(readFileSync(`${root}/images.json`));
mkdirSync(`${root}/security`, { recursive: true });
rmSync(`${root}/security/manifests`, { recursive: true, force: true });
mkdirSync(`${root}/security/manifests`, { recursive: true });
for (const item of rendered(images))
  writeFileSync(
    `${root}/security/manifests/${item.kind}-${item.metadata.name}.yaml`,
    JSON.stringify(item, null, 2),
  );
const args = ["--quiet", "--severity", "HIGH,CRITICAL", "--exit-code", "1"];
execute(".local/tools/trivy", [
  "config",
  ...args,
  "--format",
  "json",
  "--output",
  `${root}/security/config.json`,
  `${root}/security/manifests`,
]);
const config = JSON.parse(readFileSync(`${root}/security/config.json`));
if (!config.Results?.some((result) => result.Type === "kubernetes"))
  throw Error("Kubernetes manifests were not scanned.");
for (const [name, image] of [
  ...Object.entries(images),
  ["storage", versions.storage],
])
  execute(
    ".local/tools/trivy",
    [
      "image",
      ...args,
      "--format",
      "json",
      "--output",
      `${root}/security/${name}.json`,
      image,
    ],
    { timeout: 600000 },
  );
execute(".local/tools/trivy", [
  "fs",
  ...args,
  "--include-dev-deps",
  "--scanners",
  "vuln,secret",
  "--skip-dirs",
  ".local,.git,node_modules,.gradle,.nx",
  "--skip-files",
  ".env",
  ".",
]);
console.log("Kubernetes workload image, manifest and repository scans passed.");
