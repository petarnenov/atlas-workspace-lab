import { spawnSync, spawn } from "node:child_process";
import {
  randomBytes,
  generateKeyPairSync,
  sign,
  createPublicKey,
} from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  cpSync,
  chmodSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { manifests } from "./manifests.mjs";
export const root = ".local/k8s";
export const context = "kind-atlas-lab";
export const namespace = "atlas-lab";
export const versions = JSON.parse(readFileSync("infra/k8s/versions.json"));
export const kubectlTool = existsSync(".local/tools/kubectl")
  ? resolve(".local/tools/kubectl")
  : "kubectl";
export const kind = existsSync(".local/tools/kind")
  ? resolve(".local/tools/kind")
  : "kind";
export function execute(
  command,
  args,
  { input, quiet = false, sensitive = false, timeout = 600000 } = {},
) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    timeout,
    stdio: [
      "pipe",
      quiet || sensitive ? "pipe" : "inherit",
      quiet || sensitive ? "pipe" : "inherit",
    ],
  });
  if (!quiet && !sensitive) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error || result.status !== 0)
    throw Error(
      `${command} failed (${result.status ?? "spawn/timeout"}).${sensitive ? " Secret operation output suppressed." : ""}`,
    );
  return result.stdout;
}
export function validateContext(actual, expected) {
  if (
    actual !== expected ||
    !actual.includes(context) ||
    !actual.includes("https://127.0.0.1:")
  )
    throw Error(
      "Unexpected Kubernetes context/cluster identity; refusing to mutate.",
    );
}
export function guard(run = execute, read = readFileSync) {
  const expected = run(kind, ["get", "kubeconfig", "--name", namespace], {
    quiet: true,
    sensitive: true,
  });
  const actual = read(`${root}/kubeconfig`, "utf8");
  if (!actual.includes(context) || !actual.includes("https://127.0.0.1:"))
    throw Error("Unexpected local Kubernetes context.");
  if (actual === expected) {
    validateContext(actual, expected);
    return;
  }
  const canonical = (raw) => {
    // Node child-process stdin is a socket on Linux; kubectl cannot reopen it.
    const directory = mkdtempSync(resolve(tmpdir(), "atlas-kubeconfig-"));
    try {
      const file = resolve(directory, "config");
      writeFileSync(file, raw, { mode: 0o600 });
      const config = JSON.parse(
        run(
          kubectlTool,
          ["--kubeconfig", file, "config", "view", "--raw", "-o", "json"],
          { quiet: true, sensitive: true },
        ),
      );
      validateLocalConfig(config);
      return JSON.stringify(config);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
  validateContext(canonical(actual), canonical(expected));
}
export function kubectl(args, options, scope = namespace) {
  if (![namespace, "kube-system"].includes(scope))
    throw Error("Unexpected Kubernetes namespace");
  guard();
  return execute(
    kubectlTool,
    [
      "--kubeconfig",
      `${root}/kubeconfig`,
      "--context",
      context,
      "--namespace",
      scope,
      "--request-timeout=30s",
      ...args,
    ],
    options,
  );
}
export function localCredentials(
  fs = {
    exists: existsSync,
    read: readFileSync,
    write: writeFileSync,
    mkdir: mkdirSync,
  },
) {
  const files = [
    "credentials.json",
    "fixture-private.pem",
    "fixture-public.pem",
    "service-private.pem",
    "service-public.pem",
  ];
  const present = files.map((name) => fs.exists(`${root}/${name}`));
  if (present.some(Boolean) && !present.every(Boolean))
    throw Error(
      "Partial Kubernetes credentials; restore matching local files. Never regenerate against existing PVCs.",
    );
  if (present.every(Boolean)) {
    try {
      const credentials = JSON.parse(
        fs.read(`${root}/credentials.json`, "utf8"),
      );
      if (
        ![
          "POSTGRES_ADMIN",
          "ASSET_DB",
          "WORKER_DB",
          "OBJECT_ADMIN",
          "ASSET_OBJECT",
          "WORKER_OBJECT",
        ].every((name) => /^[a-f0-9]{48}$/.test(credentials[name]))
      )
        throw Error("Invalid credential shape");
      for (const name of ["fixture", "service"]) {
        const publicFromPrivate = createPublicKey(
          fs.read(`${root}/${name}-private.pem`, "utf8"),
        ).export({ type: "spki", format: "pem" });
        const publicKey = createPublicKey(
          fs.read(`${root}/${name}-public.pem`, "utf8"),
        ).export({ type: "spki", format: "pem" });
        if (publicFromPrivate !== publicKey)
          throw Error("Mismatched signing keys");
      }
      return credentials;
    } catch {
      throw Error(
        "Invalid Kubernetes credentials; restore the matching credential file and signing keys.",
      );
    }
  }
  fs.mkdir(root, { recursive: true, mode: 0o700 });
  const credentials = Object.fromEntries(
    [
      "POSTGRES_ADMIN",
      "ASSET_DB",
      "WORKER_DB",
      "OBJECT_ADMIN",
      "ASSET_OBJECT",
      "WORKER_OBJECT",
    ].map((name) => [name, randomBytes(24).toString("hex")]),
  );
  fs.write(`${root}/credentials.json`, JSON.stringify(credentials), {
    mode: 0o600,
  });
  for (const name of ["fixture", "service"]) {
    const keys = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    fs.write(`${root}/${name}-private.pem`, keys.privateKey, { mode: 0o600 });
    fs.write(`${root}/${name}-public.pem`, keys.publicKey, { mode: 0o600 });
  }
  return credentials;
}
export function doctor(run = execute) {
  const checks = [
    ["node", ["--version"], /^v24\./],
    ["pnpm", ["--version"], /^10\./],
    ["java", ["--version"], /(?:openjdk|java) 21\./],
    ["javac", ["--version"], /^javac 21\./],
    [
      kind,
      ["version"],
      new RegExp(`v${versions.kind.replaceAll(".", "\\.")}(?:\\s|$)`),
    ],
    [kubectlTool, ["version", "--client", "-o", "json"], null],
  ];
  for (const [command, args, pattern] of checks) {
    const output = run(command, args, { quiet: true });
    if (pattern && !pattern.test(output))
      throw Error(
        `Unsupported ${command} version; see infra/k8s/versions.json.`,
      );
  }
  const client = JSON.parse(
    run(kubectlTool, ["version", "--client", "-o", "json"], { quiet: true }),
  ).clientVersion;
  if (
    client.major !== "1" ||
    !/^[0-9]+\+?$/.test(client.minor) ||
    Math.abs(Number(client.minor.replace(/\D/g, "")) - 35) > 1
  )
    throw Error("kubectl must be within one minor of Kubernetes 1.35.");
  const info = JSON.parse(
    run("docker", ["info", "--format", "{{json .}}"], { quiet: true }),
  );
  if (
    !Number.isFinite(info.MemTotal) ||
    !Number.isFinite(info.NCPU) ||
    info.MemTotal < 6 * 1024 ** 3 ||
    info.NCPU < 4
  )
    throw Error(
      "Allocate at least 6 GiB Docker memory and 4 CPUs for the local cluster.",
    );
  if (existsSync(`${root}/kubeconfig`)) {
    const clusters = run(kind, ["get", "clusters"], { quiet: true })
      .trim()
      .split("\n");
    if (clusters.includes(namespace)) guard();
    else
      validateLocalConfig(
        JSON.parse(
          run(
            kubectlTool,
            [
              "config",
              "view",
              "--kubeconfig",
              `${root}/kubeconfig`,
              "--raw",
              "--minify",
              "-o",
              "json",
            ],
            { quiet: true, sensitive: true },
          ),
        ),
      );
  }
  console.log(
    "Kubernetes prerequisites OK. Dedicated context: kind-atlas-lab.",
  );
}
export function validateLocalConfig(config) {
  const selected = config.contexts?.find((item) => item.name === context);
  const cluster = config.clusters?.find(
    (item) => item.name === selected?.context.cluster,
  );
  if (
    config["current-context"] !== context ||
    selected?.context.cluster !== context ||
    !/^https:\/\/127\.0\.0\.1:[0-9]+$/.test(cluster?.cluster.server ?? "")
  )
    throw Error("Unexpected local kubeconfig; refusing cluster recreation.");
}
export function secretObjects(c, read = readFileSync) {
  const key = (name) => read(`${root}/${name}`, "utf8");
  const entries = {
    "postgres-admin": {
      POSTGRES_PASSWORD: c.POSTGRES_ADMIN,
      ASSET_DB_PASSWORD: c.ASSET_DB,
      WORKER_DB_PASSWORD: c.WORKER_DB,
    },
    "storage-admin": { RUSTFS_SECRET_KEY: c.OBJECT_ADMIN },
    "storage-bootstrap": {
      OBJECT_ADMIN_PASSWORD: c.OBJECT_ADMIN,
      ASSET_OBJECT_PASSWORD: c.ASSET_OBJECT,
      WORKER_OBJECT_PASSWORD: c.WORKER_OBJECT,
    },
    "api-identity": {
      "fixture-public.pem": key("fixture-public.pem"),
      "service-private.pem": key("service-private.pem"),
    },
    "asset-runtime": {
      LAB_ASSET_DB_PASSWORD: c.ASSET_DB,
      LAB_ASSET_OBJECT_PASSWORD: c.ASSET_OBJECT,
      "service-public.pem": key("service-public.pem"),
    },
    "worker-runtime": {
      LAB_WORKER_DB_PASSWORD: c.WORKER_DB,
      LAB_WORKER_OBJECT_PASSWORD: c.WORKER_OBJECT,
      "service-public.pem": key("service-public.pem"),
    },
  };
  return Object.entries(entries).map(([name, values]) => ({
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name, namespace },
    immutable: true,
    type: "Opaque",
    data: Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        Buffer.from(v).toString("base64"),
      ]),
    ),
  }));
}
export function reconcileSecrets(objects, kube = kubectl) {
  const existing = JSON.parse(
    kube(["get", "secrets", "-o", "json"], { quiet: true, sensitive: true }),
  ).items;
  for (const secret of objects) {
    const old = existing.find((s) => s.metadata.name === secret.metadata.name);
    if (
      old &&
      JSON.stringify(Object.entries(old.data).sort()) !==
        JSON.stringify(Object.entries(secret.data).sort())
    )
      throw Error(
        "Cluster/local credential mismatch; restore matching credentials, do not overwrite.",
      );
  }
  for (const secret of objects)
    if (!existing.some((s) => s.metadata.name === secret.metadata.name))
      kube(["create", "-f", "-"], {
        input: JSON.stringify(secret),
        quiet: true,
        sensitive: true,
      });
}
export function setup() {
  doctor();
  const clusters = execute(kind, ["get", "clusters"], { quiet: true })
    .trim()
    .split("\n");
  if (clusters.includes(namespace) && !existsSync(`${root}/credentials.json`))
    throw Error(
      "Existing cluster has no matching local credentials; restore them before setup.",
    );
  localCredentials();
  if (!clusters.includes(namespace))
    execute(kind, [
      "create",
      "cluster",
      "--name",
      namespace,
      "--image",
      versions.node,
      "--config",
      "infra/k8s/kind.json",
      "--kubeconfig",
      `${root}/kubeconfig`,
      "--wait",
      "180s",
    ]);
  else if (!existsSync(`${root}/kubeconfig`))
    throw Error("Existing cluster kubeconfig missing; restore it.");
  chmodSync(`${root}/kubeconfig`, 0o600);
  guard();
  kubectl(
    [
      "set",
      "image",
      "daemonset/kindnet",
      `kindnet-cni=${versions.networkPolicyImage}`,
    ],
    undefined,
    "kube-system",
  );
  kubectl(
    ["rollout", "status", "daemonset/kindnet", "--timeout=180s"],
    undefined,
    "kube-system",
  );
  const found = kubectl(
    ["get", "namespace", namespace, "--ignore-not-found", "-o", "name"],
    { quiet: true },
  );
  if (!found.trim())
    kubectl(["create", "-f", "-"], { input: JSON.stringify(manifests()[0]) });
  reconcileSecrets(secretObjects(localCredentials()));
}
export function build() {
  guard();
  execute("make", ["build"]);
  const built = {};
  const record = (name, args) => {
    const temporary = `atlas/${name}:candidate`;
    execute("docker", [
      "build",
      "--provenance=false",
      "-t",
      temporary,
      ...args,
    ]);
    const id = execute(
      "docker",
      ["image", "inspect", temporary, "--format", "{{.Id}}"],
      { quiet: true },
    ).trim();
    const tag = `atlas/${name}:${id.replace("sha256:", "")}`;
    execute("docker", ["tag", temporary, tag]);
    built[name] = tag;
  };
  for (const [name, dir] of [
    ["workspace-api", "services"],
    ["asset-service", "services"],
    ["processing-worker", "workers"],
  ]) {
    const dest = `${root}/build/${name}`;
    mkdirSync(dest, { recursive: true, mode: 0o700 });
    cpSync("infra/k8s/images/Java.Dockerfile", `${dest}/Dockerfile`);
    cpSync("infra/k8s/images/WorkerReady.java", `${dest}/WorkerReady.java`);
    cpSync("infra/k8s/images/NetworkCheck.java", `${dest}/NetworkCheck.java`);
    cpSync(
      `${dir}/${name}/build/libs/${name}-0.1.0-SNAPSHOT.jar`,
      `${dest}/app.jar`,
    );
    mkdirSync(`${dest}/runtime`, { recursive: true });
    if (name === "processing-worker")
      cpSync(
        "workers/processing-worker/build/libs/processing-worker-0.1.0-SNAPSHOT-parser.jar",
        `${dest}/runtime/parser.jar`,
      );
    record(name, [dest]);
  }
  const ui = `${root}/build/portal-ui`;
  mkdirSync(ui, { recursive: true });
  cpSync("infra/k8s/images/UI.Dockerfile", `${ui}/Dockerfile`);
  cpSync("infra/k8s/images/nginx.conf", `${ui}/nginx.conf`);
  cpSync("apps/portal-ui/dist", `${ui}/dist`, { recursive: true });
  record("portal-ui", [ui]);
  const postgres = `${root}/build/postgres`;
  mkdirSync(postgres, { recursive: true });
  cpSync("infra/postgres/init.sh", `${postgres}/init.sh`);
  writeFileSync(
    `${postgres}/Dockerfile`,
    readFileSync("infra/postgres/Dockerfile", "utf8") +
      "\nCOPY --chmod=0555 init.sh /docker-entrypoint-initdb.d/10-lab.sh\n",
  );
  record("postgres", [postgres]);
  record("kafka", ["infra/kafka"]);
  const storage = `${root}/build/storage-init`;
  mkdirSync(storage, { recursive: true });
  cpSync("infra/storage", storage, { recursive: true });
  writeFileSync(
    `${storage}/Dockerfile`,
    readFileSync("infra/storage/Dockerfile.bootstrap", "utf8") +
      "\nCOPY --chmod=0555 bootstrap.sh /bootstrap.sh\nENV HOME=/tmp\nUSER 10001:10001\n",
  );
  record("storage-init", [storage]);
  const storageRuntime = `${root}/build/storage`;
  mkdirSync(storageRuntime, { recursive: true });
  writeFileSync(
    `${storageRuntime}/Dockerfile`,
    `FROM ${versions.storage}\nLABEL org.atlas-lab.runtime="local-kubernetes"\n`,
  );
  record("storage", [storageRuntime]);
  loadImages(Object.values(built));
  writeFileSync(`${root}/images.json`, JSON.stringify(built, null, 2) + "\n", {
    mode: 0o600,
  });
}
export function loadImages(images, run = execute) {
  const architecture = run(
    "docker",
    ["info", "--format", "{{.Architecture}}"],
    {
      quiet: true,
    },
  ).trim();
  const platform = {
    x86_64: "linux/amd64",
    amd64: "linux/amd64",
    aarch64: "linux/arm64",
    arm64: "linux/arm64",
  }[architecture];
  if (!platform) throw Error("Unsupported Docker node architecture");
  const archive = `${root}/images.tar`;
  try {
    run(
      "docker",
      ["image", "save", "--platform", platform, "--output", archive, ...images],
      { timeout: 900000 },
    );
    run(kind, ["load", "image-archive", archive, "--name", namespace], {
      timeout: 900000,
    });
  } finally {
    rmSync(archive, { force: true });
  }
}
export function stopWorkloads(kube = kubectl) {
  const names = kube(["get", "deployments,statefulsets", "-o", "name"], {
    quiet: true,
  })
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (names.length) kube(["scale", ...names, "--replicas=0"]);
}
export function rendered(images) {
  return manifests().map((item) =>
    JSON.parse(
      JSON.stringify(item).replace(/atlas\/([a-z-]+):build/g, (_, name) => {
        if (
          !images[name] ||
          !/^atlas\/[a-z-]+:[a-f0-9]{64}$/.test(images[name])
        )
          throw Error("Missing/invalid immutable image; run make k8s-build.");
        return images[name];
      }),
    ),
  );
}
export function apply(items, kube = kubectl) {
  if (!items.length)
    throw Error("Missing Kubernetes manifests for startup stage");
  return kube(["apply", "-f", "-"], {
    input: JSON.stringify({ apiVersion: "v1", kind: "List", items }),
  });
}
export function up() {
  guard();
  reconcileSecrets(secretObjects(localCredentials()));
  const items = rendered(JSON.parse(readFileSync(`${root}/images.json`)));
  // Server-side schema/admission validation precedes mutations.
  kubectl(["apply", "--dry-run=server", "-f", "-"], {
    input: JSON.stringify({ apiVersion: "v1", kind: "List", items }),
  });
  apply(items.filter((x) => !["Deployment", "Job"].includes(x.kind)));
  for (const name of ["postgres", "kafka", "storage"])
    kubectl(["rollout", "status", `statefulset/${name}`, "--timeout=300s"]);
  for (const name of [
    "network-proof-allow",
    "network-proof-deny",
    "kafka-init",
    "storage-init",
  ]) {
    const existing = JSON.parse(
      kubectl(["get", "jobs", "-o", "json"], { quiet: true }),
    ).items.find((x) => x.metadata.name === name);
    if (existing && !existing.status?.succeeded)
      kubectl(["delete", "job", name, "--wait=true"]);
    if (!existing || !existing.status?.succeeded)
      apply(items.filter((x) => x.kind === "Job" && x.metadata.name === name));
    kubectl([
      "wait",
      "--for=condition=complete",
      `job/${name}`,
      "--timeout=180s",
    ]);
    if (name.startsWith("network-proof-"))
      kubectl(["delete", "job", name, "--wait=true"]);
  }
  apply(items.filter((x) => x.kind === "Deployment"));
  for (const name of [
    "workspace-api",
    "asset-service",
    "processing-worker",
    "portal-ui",
  ])
    kubectl(["rollout", "status", `deployment/${name}`, "--timeout=300s"]);
}
export function token(tenant = "a") {
  if (!["a", "b"].includes(tenant)) throw Error("TENANT must be a or b");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const value = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: "lab-fixture", aud: "workspace-api", sub: "synthetic-user", tenantId: tenant === "a" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222", iat: now, nbf: now, exp: now + 300 })}`;
  return `${value}.${sign("RSA-SHA256", Buffer.from(value), readFileSync(`${root}/fixture-private.pem`)).toString("base64url")}`;
}
export function stopForward(
  read = readFileSync,
  run = execute,
  kill = process.kill,
) {
  let pid;
  try {
    pid = Number(read(`${root}/forward.pid`, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (!Number.isSafeInteger(pid) || pid <= 1)
    throw Error("Invalid owned forwarding PID.");
  let command;
  try {
    command = run("ps", ["-p", String(pid), "-o", "command="], { quiet: true });
  } catch {
    return;
  }
  if (
    command.includes("kubectl") &&
    command.includes(
      `--kubeconfig ${root}/kubeconfig --context ${context} -n ${namespace} port-forward`,
    )
  )
    kill(pid, "SIGTERM");
}
export function forward() {
  guard();
  const child = spawn(
    kubectlTool,
    [
      "--kubeconfig",
      `${root}/kubeconfig`,
      "--context",
      context,
      "-n",
      namespace,
      "port-forward",
      "--address=127.0.0.1",
      "service/portal-ui",
      "5173:8080",
    ],
    { stdio: "inherit" },
  );
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/forward.pid`, String(child.pid), { mode: 0o600 });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill("SIGTERM"));
  child.once("error", () => {
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = ["SIGINT", "SIGTERM"].includes(signal) ? 0 : (code ?? 1);
  });
  return child;
}
export async function main(action) {
  if (action === "doctor") doctor();
  else if (action === "setup") setup();
  else if (action === "build") build();
  else if (action === "up") up();
  else if (action === "dev") {
    setup();
    build();
    up();
    forward();
  } else if (action === "forward") forward();
  else if (action === "token") console.log(token(process.env.TENANT ?? "a"));
  else if (action === "status") kubectl(["get", "pods,services,pvc,jobs"]);
  else if (action === "logs")
    kubectl([
      "logs",
      "--all-containers",
      "--prefix",
      "--tail=100",
      "-l",
      "app",
    ]);
  else if (action === "stop") {
    guard();
    stopForward();
    stopWorkloads();
  } else throw Error("Unknown Kubernetes action");
}
export async function withOperation(work) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = `${root}/operation.lock`;
  try {
    writeFileSync(path, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const pid = Number(readFileSync(path, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 1)
      throw Error("Invalid operation lock; inspect it locally.");
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (check) {
      if (check.code === "ESRCH") alive = false;
      else throw check;
    }
    if (alive)
      throw Error(
        "Another Kubernetes operation is active; wait for it to finish.",
      );
    unlinkSync(path);
    return withOperation(work);
  }
  try {
    return await work();
  } finally {
    unlinkSync(path);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const action = process.argv[2];
  const operation = () => main(action);
  (["setup", "build", "up", "dev", "stop"].includes(action)
    ? withOperation(operation)
    : operation()
  ).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
