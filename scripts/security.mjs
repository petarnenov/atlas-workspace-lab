import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
mkdirSync(".local/security", { recursive: true });
let failed = false;
const images = [
  ...new Set(
    [
      ...readFileSync("compose.yaml", "utf8").matchAll(/^    image: (\S+)$/gm),
    ].map((match) => match[1]),
  ),
  `${process.env.ATLAS_COMPOSE_PROJECT??"atlas-lab"}-storage-init`,
];
const commands = [
  [
    "repository",
    [
      "fs",
      "--include-dev-deps",
      "--scanners",
      "vuln,secret",
      "--skip-dirs",
      ".local",
      "--skip-dirs",
      ".git",
      "--skip-dirs",
      "node_modules",
      "--skip-dirs",
      ".gradle",
      "--skip-dirs",
      ".nx",
      "--skip-files",
      ".env",
      ".",
    ],
  ],
  ...images.map((name, index) => [
    `image-${index}`,
    ["image", "--scanners", "vuln", name],
  ]),
];
for (const [name, args] of commands) {
  const output = `.local/security/${name}.json`;
  const result = spawnSync(
    ".local/tools/trivy",
    [
      ...args.slice(0, -1),
      "--quiet",
      "--severity",
      "HIGH,CRITICAL",
      "--exit-code",
      "1",
      "--format",
      "json",
      "--output",
      output,
      args.at(-1),
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) failed = true;
  try {
    const report = JSON.parse(readFileSync(output, "utf8"));
    const vulnerabilities =
      report.Results?.flatMap((result) => result.Vulnerabilities ?? []) ?? [];
    const secrets =
      report.Results?.flatMap((result) => result.Secrets ?? []) ?? [];
    console.log(
      `${name}: ${vulnerabilities.length} HIGH/CRITICAL findings, ${secrets.length} secrets`,
    );
  } catch {
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
