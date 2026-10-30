import { spawnSync } from "node:child_process";
for (const args of [
  ["compose", "build", "postgres", "kafka", "storage-init"],
  ["compose", "up", "-d", "--wait", "postgres", "kafka", "storage"],
  ["compose", "run", "--rm", "--no-deps", "kafka-init"],
  ["compose", "run", "--rm", "--no-deps", "storage-init"],
]) {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
