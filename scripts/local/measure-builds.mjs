import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
const env = { ...process.env, NX_DAEMON: "false" };
const cases = [
  ["apps/portal-ui/src/App.tsx", ["portal-ui"]],
  [
    "services/asset-service/src/main/java/dev/atlaslab/assets/Assets.java",
    ["asset-service"],
  ],
  [
    "libraries/demo-support/src/main/java/dev/atlaslab/demo/Wire.java",
    ["asset-service", "demo-support", "processing-worker", "workspace-api"],
  ],
];
for (const [file, expected] of cases) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "nx",
      "show",
      "projects",
      "--affected",
      `--files=${file}`,
      "--json",
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).sort(), expected);
  console.log(`${file}: ${expected.join(", ")}`);
}
if (process.argv.includes("--check-only")) process.exit(0);
mkdirSync(".local/build-measurements", { recursive: true });
const runs = [
  [
    "all-uncached-nx",
    ["run-many", "-t", "build", "--all", "--parallel=1", "--skip-nx-cache"],
  ],
  ["all-populate-cache", ["run-many", "-t", "build", "--all", "--parallel=1"]],
  ["all-warm-cache", ["run-many", "-t", "build", "--all", "--parallel=1"]],
  [
    "ui-affected",
    [
      "affected",
      "-t",
      "build",
      "--files=apps/portal-ui/src/App.tsx",
      "--skip-nx-cache",
    ],
  ],
  [
    "asset-affected",
    [
      "affected",
      "-t",
      "build",
      "--files=services/asset-service/src/main/java/dev/atlaslab/assets/Assets.java",
      "--skip-nx-cache",
    ],
  ],
];
const measurements = [];
for (const [name, args] of runs) {
  const start = performance.now();
  const result = spawnSync("pnpm", ["exec", "nx", ...args], {
    env,
    encoding: "utf8",
  });
  writeFileSync(
    `.local/build-measurements/${name}.log`,
    result.stdout + result.stderr,
  );
  assert.equal(
    result.status,
    0,
    `Build ${name} failed; inspect ignored measurement log`,
  );
  const seconds = Number(((performance.now() - start) / 1000).toFixed(2));
  measurements.push({ name, seconds });
  console.log(`${name}: ${seconds}s`);
}
writeFileSync(
  ".local/build-measurements/summary.json",
  JSON.stringify(
    {
      note: "Single local sample; existing pnpm/Gradle downloads and Gradle outputs are warm. Uncached refers to Nx task cache only.",
      measurements,
    },
    null,
    2,
  ) + "\n",
);
