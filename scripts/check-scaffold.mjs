import { existsSync, readFileSync } from "node:fs";

const required = [
  "AGENTS.md",
  "README.md",
  "nx.json",
  "pnpm-workspace.yaml",
  "openspec/config.yaml",
  "docs/architecture/repository-strategy.md",
  ".github/pull_request_template.md",
];

const missing = required.filter((path) => !existsSync(path));
if (missing.length) {
  console.error("Missing foundation files:", missing.join(", "));
  process.exit(1);
}
const guidance = readFileSync("AGENTS.md", "utf8");
if (
  !guidance.includes("human review") &&
  !guidance.includes("human-approved")
) {
  console.error("AGENTS.md must require human approval before implementation.");
  process.exit(1);
}
console.log(
  "Foundation scaffold checks passed. Application integration is not tested.",
);
