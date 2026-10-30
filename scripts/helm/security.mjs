import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { render, images, applications, namespace } from "./runtime.mjs";
import { execute } from "../k8s/runtime.mjs";
import { pathToFileURL } from "node:url";
export function runSecurity() {
  const output = ".local/helm/security";
  mkdirSync(output, { recursive: true });
  rmSync(`${output}/manifests`, { recursive: true, force: true });
  mkdirSync(`${output}/manifests`, { recursive: true });
  const scanned = new Set();
  const args = ["--quiet", "--severity", "HIGH,CRITICAL", "--exit-code", "1"];
  for (const env of ["dev", "prod"]) {
    for (const service of ["platform", ...applications])
      for (const item of render(env, service))
        writeFileSync(
          `${output}/manifests/${namespace(env)}-${item.kind}-${item.metadata.name}.yaml`,
          JSON.stringify(item, null, 2),
        );
    for (const [name, image] of Object.entries(images(env))) {
      if (scanned.has(image)) continue;
      execute(
        ".local/tools/trivy",
        [
          "image",
          ...args,
          "--format",
          "json",
          "--output",
          `${output}/${env}-${name}.json`,
          image,
        ],
        { timeout: 600000 },
      );
      scanned.add(image);
    }
  }
  execute(".local/tools/trivy", [
    "config",
    ...args,
    "--format",
    "json",
    "--output",
    `${output}/config.json`,
    `${output}/manifests`,
  ]);
  if (
    !JSON.parse(readFileSync(`${output}/config.json`)).Results?.some(
      (x) => x.Type === "kubernetes",
    )
  )
    throw Error("Rendered Kubernetes resources were not scanned");
  // Scan chart sources for secrets; configuration checks above scan the actual
  // release/namespace-aware output of every chart and both reviewed profiles.
  // Trivy's built-in Helm renderer cannot supply our required release ownership.
  execute(".local/tools/trivy", [
    "fs",
    ...args,
    "--scanners",
    "secret",
    "infra/helm",
  ]);
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
  console.log(
    "Helm charts, both rendered demo profiles, images and repository security checks passed.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runSecurity();
