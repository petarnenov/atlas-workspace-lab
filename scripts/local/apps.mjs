import { readFileSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
const env = { ...process.env };
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2];
}
mkdirSync(".local/logs", { recursive: true });
const modules = new Map([
  ["parser-forward", "scripts/local/parser-forward.mjs"],
  ["asset-service", "services/asset-service"],
  ["workspace-api", "services/workspace-api"],
  ["processing-worker", "workers/processing-worker"],
]);
const children = new Map();
let stopping = false;
const restarting = new Set();
function state() {
  writeFileSync(
    ".local/apps.json",
    JSON.stringify({
      harness: process.pid,
      ...Object.fromEntries(
        [...children].map(([name, child]) => [name, child.pid]),
      ),
    }),
    { mode: 0o600 },
  );
}
function start(name) {
  const log = openSync(`.local/logs/${name}.log`, "a", 0o600);
  const child = spawn(
    name === "parser-forward" ? process.execPath : "java",
    name === "parser-forward" ? [modules.get(name)] : [
      "-Xmx192m",
      "-jar",
      `${modules.get(name)}/build/libs/${name}-0.1.0-SNAPSHOT.jar`,
    ],
    { env, stdio: ["ignore", log, log] },
  );
  children.set(name, child);
  state();
  child.on("exit", (code) => {
    if (stopping) return;
    if (restarting.delete(name)) {
      start(name);
      return;
    }
    console.error(`${name} exited (${code}); inspect ignored local logs.`);
    stop();
    process.exitCode = 1;
  });
}
function stop() {
  stopping = true;
  for (const child of children.values()) child.kill("SIGTERM");
}
for (const name of modules.keys()) start(name);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Local failure-injection fixture: restart only the worker, preserving all durable stores.
process.on("SIGUSR2", () => {
  if (stopping || restarting.has("processing-worker")) return;
  restarting.add("processing-worker");
  children.get("processing-worker").kill("SIGKILL");
});
