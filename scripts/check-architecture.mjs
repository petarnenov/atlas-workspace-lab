import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const principles = readFileSync("docs/architecture/principles.md", "utf8");
const instructions = readFileSync("AGENTS.md", "utf8");

for (let n = 1; n <= 21; n++) {
  const id = `P${String(n).padStart(2, "0")}`;
  if (!principles.includes(`### ${id} —`)) {
    throw new Error(`Missing architecture principle: ${id}`);
  }
}
if (
  !instructions.includes("docs/architecture/principles.md") ||
  !instructions.includes("explicit human approval")
) {
  throw new Error(
    "Codex AGENTS.md must reference the architecture and human SDD gate.",
  );
}

const roots = ["apps", "services", "workers", "libraries"];
const matches = [];
const banned = [/(?:^|\/)__pycache__(?:\/|$)/, /\.py$/i];
function scan(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      ["node_modules", ".gradle", "build", "dist", ".git", ".venv", "__pycache__", ".pytest_cache"].includes(entry.name)
    )
      continue;
    const path = join(dir, entry.name);
    const normalized = relative(".", path).replaceAll("\\", "/");
    if (!normalized.startsWith("services/docling-parser/") && banned.some((pattern) => pattern.test(normalized)))
      matches.push(normalized);
    if (entry.isFile() && entry.name.endsWith(".java")) {
      const source = readFileSync(path, "utf8");
      const owner = normalized.startsWith("services/asset-service/")
        ? "assets"
        : normalized.startsWith("services/workspace-api/")
          ? "workspace"
          : normalized.startsWith("workers/processing-worker/")
            ? "worker"
            : "demo";
      for (const imported of source.matchAll(
        /\bimport\s+(?:static\s+)?dev\.atlaslab\.(assets|workspace|worker|demo)\./g,
      )) {
        if (imported[1] !== owner && imported[1] !== "demo") {
          throw new Error(
            `Private cross-service import in ${normalized}: ${imported[1]}`,
          );
        }
      }
    }
    if (entry.isDirectory()) scan(path);
  }
}
for (const root of roots) scan(root);
if (matches.length)
  throw new Error(`Unexpected Python files: ${matches.join(", ")}`);

console.log("P01–P21 document, Codex reference, and scoped Python exception checks passed.");
console.log(
  "NOTE: This does not prove runtime security, contract compatibility, or architectural correctness.",
);
