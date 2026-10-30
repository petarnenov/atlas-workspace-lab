import { readFileSync, existsSync } from "node:fs";
const modules = [
  "libraries/demo-support",
  "services/asset-service",
  "services/workspace-api",
  "workers/processing-worker",
];
for (const module of modules) {
  const xml = readFileSync(
    `${module}/build/reports/jacoco/test/jacocoTestReport.xml`,
    "utf8",
  );
  const counters = [
    ...xml.matchAll(/<counter type="LINE" missed="(\d+)" covered="(\d+)"\/>/g),
  ];
  const last = counters.at(-1);
  if (!last) throw new Error(`No source coverage for ${module}`);
  const missed = Number(last[1]),
    covered = Number(last[2]);
  const percent = (100 * covered) / (missed + covered);
  console.log(
    `${module}: ${covered}/${missed + covered} source lines (${percent.toFixed(2)}%)`,
  );
  if (percent < 75) process.exitCode = 1;
}
const ui = "apps/portal-ui/coverage/coverage-summary.json";
if (existsSync(ui)) {
  const { total } = JSON.parse(readFileSync(ui, "utf8"));
  console.log(
    `portal-ui: ${total.lines.pct}% lines, ${total.branches.pct}% branches`,
  );
  if (total.lines.pct < 75 || total.branches.pct < 75) process.exitCode = 1;
}
