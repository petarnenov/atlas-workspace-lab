import { spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  cpSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as native from "../k8s/runtime.mjs";
import {workerIdentity} from '../local/artifact-credentials.mjs';
export const applications = [
  "portal-ui",
  "workspace-api",
  "asset-service",
  "processing-worker",
  "docling-parser",
];
export const imageNames = [
  ...applications,
  "postgres",
  "kafka",
  "storage",
  "storage-init",
];
export const helmTool = resolve(".local/tools/helm");
export const pins = JSON.parse(readFileSync("infra/helm/versions.json"));
export function environment(value = process.env.ENV ?? "dev") {
  if (!["dev", "prod"].includes(value))
    throw Error("ENV must be dev or prod (synthetic local demos only)");
  return value;
}
export function component(value) {
  if (!applications.includes(value))
    throw Error("SERVICE must name a supported application");
  return value;
}
export const directory = (env) => `${native.runtimeRoot}/helm/${environment(env)}`;
export const namespace = (env) => `atlas-${environment(env)}`;
export const release = (service) =>
  service === "platform" ? "atlas-platform" : `atlas-${component(service)}`;
export function kube(env, args, options) {
  const ns = namespace(env);
  native.guard();
  return native.execute(
    native.kubectlTool,
    [
      "--kubeconfig",
      `${native.root}/kubeconfig`,
      "--context",
      native.context,
      "--namespace",
      ns,
      "--request-timeout=30s",
      ...args,
    ],
    options,
  );
}
export function helm(env, args, options = { quiet: true }) {
  environment(env);
  native.guard();
  return native.execute(
    helmTool,
    [
      "--kubeconfig",
      `${native.root}/kubeconfig`,
      "--kube-context",
      native.context,
      "--namespace",
      namespace(env),
      ...args,
    ],
    options,
  );
}
export function images(env) {
  const result = JSON.parse(readFileSync(`${directory(env)}/images.json`));
  if (
    Object.keys(result).length !== imageNames.length ||
    imageNames.some(
      (n) => !new RegExp(`^atlas/${n}:[a-f0-9]{64}$`).test(result[n] ?? ""),
    )
  )
    throw Error(
      "Missing/invalid immutable images; run make helm-build for this environment",
    );
  return result;
}
export function values(
  env,
  service = "platform",
  stopped = false,
  inventory = images(env),
) {
  environment(env);
  if (service !== "platform") component(service);
  const chart = service === "platform" ? "atlas-platform" : "atlas-component";
  const profile = JSON.parse(
    readFileSync(`infra/helm/${chart}/values-${env}.yaml`),
  );
  const mode=process.env.ATLAS_ARTIFACT_MODE??'portable';
  if(!['legacy','portable'].includes(mode))throw Error('ATLAS_ARTIFACT_MODE must be legacy or portable');
  return { ...profile, component: service, stopped, images: inventory,
    ...(service==='platform'?{}:{artifactsEnabled:mode==='portable'}) };
}
export function parseManifests(text) {
  return text
    .split(/^---\s*$/m)
    .map((x) =>
      x
        .split("\n")
        .filter((line) => !line.startsWith("#"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .map((x) => JSON.parse(x));
}
export function render(
  env,
  service = "platform",
  configuration = values(env, service),
) {
  const chart = service === "platform" ? "atlas-platform" : "atlas-component";
  return parseManifests(
    native.execute(
      helmTool,
      [
        "template",
        release(service),
        `infra/helm/${chart}`,
        "--namespace",
        namespace(env),
        "--kube-version",
        "1.35.8",
        "--values",
        "-",
      ],
      { input: JSON.stringify(configuration), quiet: true },
    ),
  );
}
export function doctor(env) {
  environment(env);
  native.doctor();
  const actual = native.execute(helmTool, ["version", "--short"], {
    quiet: true,
  });
  if (!actual.startsWith(`v${pins.helm}+`))
    throw Error(`Helm ${pins.helm} is required; run make helm-tools`);
  const info = JSON.parse(
    native.execute("docker", ["info", "--format", "{{json .}}"], {
      quiet: true,
    }),
  );
  if (info.MemTotal < 14 * 1024 ** 3 || info.NCPU < 4)
    throw Error(
      "Allocate at least 14 GiB Docker RAM for concurrent dev/prod demos",
    );
  console.log(
    `Helm ${env} demo prerequisites OK (both profiles require 4 CPUs / 14 GiB Docker RAM; 8 CPUs recommended for concurrent parser replicas).`,
  );
}
export function validateNamespace(env, current) {
  const labels = current?.metadata?.labels;
  if (
    current?.metadata?.name !== namespace(env) ||
    labels?.["atlas-lab/environment"] !== env ||
    labels?.["app.kubernetes.io/managed-by"] !== "atlas-setup" ||
    labels?.["pod-security.kubernetes.io/enforce"] !== "restricted"
  )
    throw Error("Namespace ownership/security mismatch; refusing mutation");
}
function local(env, create = false) {
  const dir = directory(env);
  if (!create && !existsSync(`${dir}/credentials.json`))
    throw Error(
      "Environment credentials missing; run helm-setup or restore matching files",
    );
  return native.localCredentials(undefined, dir);
}
export function secrets(env, create = false) {
  return native.secretObjects(
    local(env, create),
    readFileSync,
    directory(env),
    namespace(env),
  );
}
export function assertCredentials(env) {
  const expected = secrets(env);
  const existing = JSON.parse(
    kube(env, ["get", "secrets", "-o", "json"], {
      quiet: true,
      sensitive: true,
    }),
  ).items;
  for (const item of expected) {
    const old = existing.find((x) => x.metadata.name === item.metadata.name);
    if (
      !old ||
      JSON.stringify(Object.entries(old.data).sort()) !==
        JSON.stringify(Object.entries(item.data).sort())
    )
      throw Error(
        "Missing/mismatched environment Secrets; restore matching state",
      );
  }
}
export function assertNamespace(env) {
  validateNamespace(
    env,
    JSON.parse(
      kube(env, ["get", "namespace", namespace(env), "-o", "json"], {
        quiet: true,
      }),
    ),
  );
}
export function setup(env) {
  environment(env);
  doctor(env);
  native.setup({ clusterOnly: true });
  const found = kube(
    env,
    ["get", "namespace", namespace(env), "--ignore-not-found", "-o", "json"],
    { quiet: true },
  );
  if (found.trim()) {
    validateNamespace(env, JSON.parse(found));
    local(env);
  } else {
    // Never regenerate partial local state, even if the namespace was deleted.
    local(env, true);
    kube(env, ["create", "-f", "-"], {
      input: JSON.stringify({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: namespace(env),
          labels: {
            "atlas-lab/environment": env,
            "app.kubernetes.io/managed-by": "atlas-setup",
            "pod-security.kubernetes.io/enforce": "restricted",
            "pod-security.kubernetes.io/enforce-version": "v1.35",
          },
        },
      }),
    });
  }
  workerIdentity(directory(env),true);
  native.reconcileSecrets(secrets(env), (args, options) =>
    kube(env, args, options),
  );
}
export function build(env, service = process.env.SERVICE) {
  environment(env);
  assertNamespace(env);
  assertCredentials(env);
  if (service) {
    component(service);
    const inventory = images(env);
    inventory[service] = native.buildComponent(service);
    writeFileSync(directory(env)+"/images.json",JSON.stringify(inventory,null,2)+"\n",{mode:0o600});
    return;
  }
  native.build();
  cpSync(`${native.root}/images.json`, `${directory(env)}/images.json`);
}
export function ownership(env, service, items) {
  const deployed = JSON.parse(
    kube(
      env,
      [
        "get",
        "deployments,statefulsets,services,configmaps,networkpolicies,jobs",
        "-o",
        "json",
      ],
      { quiet: true },
    ),
  ).items;
  for (const item of items) {
    const old = deployed.find(
      (x) => x.kind === item.kind && x.metadata.name === item.metadata.name,
    );
    if (
      old &&
      (old.metadata.labels?.["app.kubernetes.io/managed-by"] !== "Helm" ||
        old.metadata.annotations?.["meta.helm.sh/release-name"] !==
          release(service) ||
        old.metadata.annotations?.["meta.helm.sh/release-namespace"] !==
          namespace(env))
    )
      throw Error("Resource ownership collision; refusing takeover");
  }
}
export function upgrade(env, service, configuration = values(env, service)) {
  const items = render(env, service, configuration);
  ownership(env, service, items);
  const chart = service === "platform" ? "atlas-platform" : "atlas-component";
  const args = [
    "upgrade",
    "--install",
    release(service),
    `infra/helm/${chart}`,
    "--values",
    "-",
    "--wait",
    "--wait-for-jobs",
    "--timeout",
    "8m",
    "--history-max",
    "10",
  ];
  if (configuration.stopped) args.push("--no-hooks");
  helm(env, args, {
    input: JSON.stringify(configuration),
    quiet: false,
    timeout: 900000,
  });
  console.log(
    `${env}: ${release(service)} ${configuration.stopped ? "stopped" : "ready"}`,
  );
}
export function up(env) {
  environment(env);
  assertNamespace(env);
  assertCredentials(env);
  images(env);
  upgrade(env, "platform");
  for (const service of [
    "workspace-api",
    "asset-service",
    "docling-parser",
    "processing-worker",
    "portal-ui",
  ])
    upgrade(env, service);
}
export function deploy(env, service) {
  environment(env);
  component(service);
  assertNamespace(env);
  assertCredentials(env);
  const status = JSON.parse(
    helm(env, ["status", "atlas-platform", "-o", "json"]),
  );
  if (status.info.status !== "deployed")
    throw Error("Platform must be ready before independent app deployment");
  const platform = JSON.parse(
    helm(env, ["get", "values", "atlas-platform", "-o", "json"]),
  );
  validateConfiguration(env, "platform", platform);
  const dependencies = JSON.parse(
    kube(env, ["get", "statefulsets", "-o", "json"], { quiet: true }),
  ).items;
  if (
    platform.stopped ||
    ["postgres", "kafka", "storage"].some(
      (name) =>
        !dependencies.some(
          (item) =>
            item.metadata.name === name &&
            item.spec.replicas === 1 &&
            item.status.readyReplicas === 1,
        ),
    )
  )
    throw Error("Platform dependencies are stopped or not ready");
  upgrade(env, service);
}
export function stop(env) {
  environment(env);
  assertNamespace(env);
  assertCredentials(env);
  stopForward(env);
  const installed = JSON.parse(helm(env, ["list", "-o", "json"]));
  for (const service of [...applications, "platform"]) {
    if (!installed.some((x) => x.name === release(service))) continue;
    const configuration = JSON.parse(
      helm(env, ["get", "values", release(service), "-o", "json"]),
    );
    validateConfiguration(env, service, configuration);
    upgrade(env, service, { ...configuration, stopped: true });
  }
}
export function validateConfiguration(env, service, configuration) {
  if (
    configuration.environment !== environment(env) ||
    configuration.component !== service ||
    configuration.syntheticDemo !== true
  )
    throw Error("Release values do not match environment/component");
}
export function rollback(env, service, revision) {
  environment(env);
  component(service);
  if (!/^[1-9][0-9]*$/.test(String(revision)))
    throw Error("REVISION must be a positive existing app revision");
  assertNamespace(env);
  assertCredentials(env);
  const history = JSON.parse(
    helm(env, ["history", release(service), "-o", "json"]),
  );
  const entry = history.find((x) => x.revision === Number(revision));
  if (
    !entry ||
    !["deployed", "superseded"].includes(entry.status) ||
    !entry.chart.startsWith("atlas-component-0.1.")
  )
    throw Error("Unknown/incompatible app revision");
  const previous = JSON.parse(
    helm(env, [
      "get",
      "values",
      release(service),
      "--revision",
      String(revision),
      "-o",
      "json",
    ]),
  );
  validateConfiguration(env, service, previous);
  if (previous.stopped) throw Error("Cannot roll back to a stopped release");
  ownership(env, service, render(env, service, previous));
  const inventory = images(env);
  helm(
    env,
    [
      "rollback",
      release(service),
      String(revision),
      "--wait",
      "--wait-for-jobs",
      "--timeout",
      "8m",
    ],
    { quiet: true, timeout: 600000 },
  );
  inventory[service] = previous.images[service];
  writeFileSync(
    `${directory(env)}/images.json`,
    JSON.stringify(inventory, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    `${env}: rolled back ${release(service)} to compatible revision ${revision}`,
  );
}
export function stopForward(
  env,
  read = readFileSync,
  run = native.execute,
  kill = process.kill,
) {
  let pid;
  try {
    pid = Number(read(`${directory(env)}/forward.pid`, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  if (!Number.isSafeInteger(pid) || pid <= 1)
    throw Error("Invalid owned forwarding PID");
  let command;
  try {
    command = run("ps", ["-p", String(pid), "-o", "command="], { quiet: true });
  } catch {
    return;
  }
  if (
    command.includes("kubectl") &&
    command.includes(
      `--kubeconfig ${native.root}/kubeconfig --context ${native.context} -n ${namespace(env)} port-forward`,
    )
  )
    kill(pid, "SIGTERM");
}
export function uiPort(env) {
  environment(env);
  const port=Number(process.env.ATLAS_UI_PORT ?? (env==='dev'?5173:5174));
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback UI port');
  return port;
}
export function forward(env) {
  environment(env);
  assertNamespace(env);
  const child = spawn(
    native.kubectlTool,
    [
      "--kubeconfig",
      `${native.root}/kubeconfig`,
      "--context",
      native.context,
      "-n",
      namespace(env),
      "port-forward",
      "--address=127.0.0.1",
      "service/portal-ui",
      `${uiPort(env)}:8080`,
    ],
    { stdio: "inherit" },
  );
  mkdirSync(directory(env), { recursive: true, mode: 0o700 });
  writeFileSync(`${directory(env)}/forward.pid`, String(child.pid), {
    mode: 0o600,
  });
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
export function lint(env) {
  for (const service of ["platform", ...applications]) {
    const chart = service === "platform" ? "atlas-platform" : "atlas-component";
    native.execute(
      helmTool,
      ["lint", `infra/helm/${chart}`, "--strict", "--values", "-"],
      { input: JSON.stringify(values(env, service)) },
    );
    render(env, service);
  }
}
export async function main(
  action,
  env = environment(),
  service = process.env.SERVICE,
) {
  environment(env);
  if (action === "doctor") doctor(env);
  else if (action === "setup") setup(env);
  else if (action === "build") build(env);
  else if (action === "up") up(env);
  else if (action === "deploy") deploy(env, service);
  else if (action === "stop") stop(env);
  else if (action === "rollback") rollback(env, service, process.env.REVISION);
  else if (action === "forward") forward(env);
  else if (action === "token")
    console.log(native.token(process.env.TENANT ?? "a", directory(env)));
  else if (action === "status") {
    console.log(`${env} synthetic demo (${namespace(env)})`);
    helm(env, ["list"], { quiet: false });
    if (service)
      helm(env, ["history", release(component(service))], { quiet: false });
    kube(env, ["get", "pods,services,pvc,jobs"]);
  } else if (action === "logs")
    kube(env, [
      "logs",
      "--all-containers",
      "--prefix",
      "--tail=100",
      "-l",
      "app",
    ]);
  else if (action === "lint") lint(env);
  else if (action === "template") {
    for (const s of ["platform", ...applications])
      for (const item of render(env, s))
        console.log("---\n" + JSON.stringify(item, null, 2));
  } else if (action === "dev" || action === "prod") {
    setup(action);
    build(action);
    up(action);
    forward(action);
  } else throw Error("Unknown Helm action");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const action = process.argv[2];
  const operation = () => main(action);
  ([
    "setup",
    "build",
    "up",
    "deploy",
    "stop",
    "rollback",
    "dev",
    "prod",
  ].includes(action)
    ? native.withOperation(operation)
    : operation()
  ).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
