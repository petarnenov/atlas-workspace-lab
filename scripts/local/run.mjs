import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const env = { ...process.env };
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (match) env[match[1]] = match[2];
}
const [command, ...args] = process.argv.slice(2);
if (!command)
  throw new Error("Usage: node scripts/local/run.mjs command args...");
const child = spawn(command, args, { env, stdio: "inherit" });
child.on("exit", (code) => (process.exitCode = code ?? 1));
