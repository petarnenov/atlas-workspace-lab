import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  rmSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { once } from "node:events";

test("Kubernetes tools enforce ownership, repeatability, staged startup and failure paths", async () => {
  const original = process.cwd();
  const temp = mkdtempSync(`${tmpdir()}/atlas-k8s-test-`);
  const oldPath = process.env.PATH;
  for (const dir of [
    "infra",
    ".local/tools",
    ".local/k8s",
    "bin",
    "apps/portal-ui/dist",
  ])
    mkdirSync(`${temp}/${dir}`, { recursive: true });
  cpSync(`${original}/infra`, `${temp}/infra`, { recursive: true });
  const fake = `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');const name=path.basename(process.argv[1]);const args=process.argv.slice(2),s=args.join(' ');const mode=process.env.FAKE_MODE;
if(mode==='fail'){console.error('synthetic failure');process.exit(9)}
if(mode==='init-failure'&&name==='kubectl'&&s.includes('wait --for=condition=complete job/kafka-init'))process.exit(8);
if(name==='trivy'&&args.includes('--output'))fs.writeFileSync(args[args.indexOf('--output')+1],JSON.stringify({Results:[{Type:'kubernetes'}]}));
if(name==='kind'){
 if(s==='version')console.log('kind v0.33.0');
 else if(s==='get clusters')console.log(mode==='fresh'?'':'atlas-lab');
 else if(args[0]==='create'){fs.writeFileSync('.local/k8s/kubeconfig','kind-atlas-lab https://127.0.0.1:6443\\n');fs.writeFileSync('.local/k8s/created-config',args[args.indexOf('--config')+1]);}
 else if(s.startsWith('get kubeconfig'))console.log('kind-atlas-lab https://127.0.0.1:6443');
} else if(name==='kubectl'){
 if(s==='version --client -o json')console.log(JSON.stringify({clientVersion:{major:'1',minor:mode==='skew'?'30':'35'}}));
 else if(s.includes('config view'))console.log(JSON.stringify({'current-context':'kind-atlas-lab',contexts:[{name:'kind-atlas-lab',context:{cluster:'kind-atlas-lab'}}],clusters:[{name:'kind-atlas-lab',cluster:{server:'https://127.0.0.1:6443'}}]}));
 else if(s.includes('get namespace'))console.log(mode==='fresh'?'':'namespace/atlas-lab');
 else if(s.includes('get secrets'))console.log(JSON.stringify({items:[]}));
 else if(s.includes('get jobs'))console.log(JSON.stringify({items:mode==='complete'?[{metadata:{name:'kafka-init'},status:{succeeded:1}},{metadata:{name:'storage-init'},status:{succeeded:1}}]:mode==='retry'?[{metadata:{name:'kafka-init'},status:{failed:1}}]:[]}));
 else if(args.includes('-')){const data=fs.readFileSync(0,'utf8');if(mode==='init-failure'&&!args.includes('--dry-run=server')&&data.includes('Deployment'))fs.writeFileSync('.local/k8s/deployment-after-failure','bad');}
} else if(name==='docker'){
 if(s==='info --format {{.Architecture}}')console.log('x86_64');
 else if(args[0]==='info')console.log(JSON.stringify({NCPU:mode==='small'?1:8,MemTotal:8*1024**3}));
 if(args[0]==='image')console.log('sha256:'+('a'.repeat(64)));
} else if(name==='java')console.log(mode==='old-java'?'openjdk 17.0.1':'openjdk 21.0.1');
else if(name==='javac')console.log('javac 21.0.1');else if(name==='pnpm')console.log('10.0.0');
`;
  for (const name of [
    "kind",
    "kubectl",
    "docker",
    "make",
    "java",
    "javac",
    "pnpm",
  ])
    writeFileSync(
      `${temp}/${name === "kind" ? ".local/tools" : "bin"}/${name}`,
      fake,
      { mode: 0o755 },
    );
  for (const [name, dir] of [
    ["workspace-api", "services"],
    ["asset-service", "services"],
    ["processing-worker", "workers"],
  ]) {
    const path = `${temp}/${dir}/${name}/build/libs`;
    mkdirSync(path, { recursive: true });
    writeFileSync(`${path}/${name}-0.1.0-SNAPSHOT.jar`, "synthetic fixture");
  }
  writeFileSync(
    `${temp}/workers/processing-worker/build/libs/processing-worker-0.1.0-SNAPSHOT-parser.jar`,
    "synthetic parser",
  );
  process.chdir(temp);
  process.env.PATH = `${temp}/bin:${oldPath}`;
  try {
    const r = await import("./runtime.mjs");
    assert.throws(() => r.validateContext("wrong", "expected"));
    assert.throws(() => r.validateContext("same", "same"));
    r.validateContext(
      "kind-atlas-lab https://127.0.0.1:6443",
      "kind-atlas-lab https://127.0.0.1:6443",
    );
    process.env.FAKE_MODE = "fresh";
    r.setup();
    assert.equal(readFileSync('.local/k8s/created-config','utf8'),'infra/k8s/kind.json');
    process.env.ATLAS_KIND_WORKER = "1";
    try {
      r.setup();
      assert.equal(readFileSync('.local/k8s/created-config','utf8'),'infra/k8s/kind-ci.json');
      assert.deepEqual(JSON.parse(readFileSync('infra/k8s/kind-ci.json')).nodes.map(node=>node.role),['control-plane','worker']);
      assert.match(JSON.parse(readFileSync('infra/k8s/kind-ci.json')).nodes[0].kubeadmConfigPatches[0],/nodeRegistration:\n  taints: \[\]/);
    } finally { delete process.env.ATLAS_KIND_WORKER; }
    // Fake kind's stdout includes its usual trailing newline.
    writeFileSync(
      ".local/k8s/kubeconfig",
      "kind-atlas-lab https://127.0.0.1:6443\n",
    );
    delete process.env.FAKE_MODE;
    const c = r.localCredentials();
    assert.deepEqual(r.localCredentials(), c);
    const privateKey = readFileSync(".local/k8s/fixture-private.pem");
    writeFileSync(".local/k8s/fixture-private.pem", "invalid");
    assert.throws(() => r.localCredentials());
    writeFileSync(".local/k8s/fixture-private.pem", privateKey);
    const credentials = readFileSync(".local/k8s/credentials.json");
    writeFileSync(".local/k8s/credentials.json", "{}");
    assert.throws(() => r.localCredentials());
    writeFileSync(".local/k8s/credentials.json", credentials);
    rmSync(".local/k8s/service-public.pem");
    assert.throws(() => r.localCredentials());
    // Regenerate only test fixtures in a newly empty directory.
    rmSync(".local/k8s", { recursive: true });
    mkdirSync(".local/k8s");
    assert.throws(() => r.setup()); // Existing cluster without matching credentials.
    r.localCredentials();
    assert.throws(() => r.setup()); // Missing kubeconfig.
    writeFileSync(
      ".local/k8s/kubeconfig",
      "kind-atlas-lab https://127.0.0.1:6443\n",
    );
    r.setup();
    r.doctor();
    assert.throws(() => r.validateLocalConfig({}));
    r.validateLocalConfig({
      "current-context": "kind-atlas-lab",
      contexts: [
        { name: "kind-atlas-lab", context: { cluster: "kind-atlas-lab" } },
      ],
      clusters: [
        {
          name: "kind-atlas-lab",
          cluster: { server: "https://127.0.0.1:6443" },
        },
      ],
    });
    process.env.FAKE_MODE = "fresh";
    r.doctor();
    delete process.env.FAKE_MODE;
    await r.withOperation(async () => {
      await assert.rejects(r.withOperation(async () => {}));
    });
    await assert.rejects(
      r.withOperation(async () => {
        throw Error("synthetic operation failure");
      }),
    );
    writeFileSync(".local/k8s/operation.lock", "2147483647");
    await r.withOperation(async () => {});
    writeFileSync(".local/k8s/operation.lock", "invalid");
    await assert.rejects(r.withOperation(async () => {}));
    rmSync(".local/k8s/operation.lock");

    for (const mode of ["skew", "small", "old-java", "fail"]) {
      process.env.FAKE_MODE = mode;
      assert.throws(() => r.doctor());
    }
    delete process.env.FAKE_MODE;
    assert.throws(() => r.execute("missing-atlas-command", []));
    process.env.FAKE_MODE = "fail";
    assert.throws(() => r.execute("docker", [], { sensitive: true }));
    delete process.env.FAKE_MODE;
    r.build();
    for (const architecture of ["x86_64", "aarch64"]) {
      const calls = [];
      r.loadImages(["synthetic/image:fixture"], (command, args) => {
        calls.push(args);
        if (args[0] === "info") return architecture;
        if (args.includes("save"))
          writeFileSync(".local/k8s/images.tar", "fixture");
        return "";
      });
      assert.ok(
        calls[1].includes(
          architecture === "x86_64" ? "linux/amd64" : "linux/arm64",
        ),
      );
      assert.equal(calls[2][1], "image-archive");
      assert.equal(existsSync(".local/k8s/images.tar"), false);
    }
    assert.throws(() => r.loadImages([], () => "unsupported"));
    assert.throws(() =>
      r.loadImages([], (command, args) => {
        if (args[0] === "info") return "amd64";
        writeFileSync(".local/k8s/images.tar", "partial");
        throw Error("export failed");
      }),
    );
    assert.equal(existsSync(".local/k8s/images.tar"), false);
    let scales = 0;
    r.stopWorkloads(() => "");
    r.stopWorkloads((args) => {
      if (args[0] === "get")
        return "deployment.apps/example\nstatefulset.apps/database\n";
      assert.deepEqual(args, [
        "scale",
        "deployment.apps/example",
        "statefulset.apps/database",
        "--replicas=0",
      ]);
      scales++;
    });
    assert.equal(scales, 1);
    const images = JSON.parse(readFileSync(".local/k8s/images.json"));
    assert.throws(() => r.kubectl([], undefined, "unrelated"));
    assert.throws(() => r.apply([], () => assert.fail("empty stage")));
    const rendered = r.rendered(images);
    assert.equal(
      rendered.find(
        (x) => x.kind === "StatefulSet" && x.metadata.name === "storage",
      ).spec.template.spec.containers[0].image,
      images.storage,
    );
    assert.equal(Object.keys(images).length, 9);
    assert.ok(rendered.length > 30);
    assert.throws(() => r.rendered({}));
    assert.throws(() => r.rendered({ "workspace-api": "latest" }));
    for (const mode of ["none", "retry", "complete"]) {
      process.env.FAKE_MODE = mode;
      r.up();
    }
    process.env.FAKE_MODE = "init-failure";
    assert.throws(() => r.up());
    assert.equal(existsSync(".local/k8s/deployment-after-failure"), false);
    delete process.env.FAKE_MODE;
    const canonical = {
      "current-context": "kind-atlas-lab",
      contexts: [
        { name: "kind-atlas-lab", context: { cluster: "kind-atlas-lab" } },
      ],
      clusters: [
        {
          name: "kind-atlas-lab",
          cluster: { server: "https://127.0.0.1:6443" },
        },
      ],
    };
    const temporaryConfigs = [];
    r.guard(
      (command, args, options) => {
        if (args[0] === "get") return "kind-atlas-lab https://127.0.0.1:6443";
        const file = args[1];
        temporaryConfigs.push(file);
        assert.notEqual(file, "/dev/stdin");
        assert.equal(statSync(file).mode & 0o777, 0o600);
        assert.equal(statSync(dirname(file)).mode & 0o777, 0o700);
        assert.ok(readFileSync(file, "utf8").includes("kind-atlas-lab"));
        assert.equal(options.sensitive, true);
        assert.equal(options.input, undefined);
        return JSON.stringify(canonical);
      },
      () => "kind-atlas-lab https://127.0.0.1:6443 ",
    );
    for (const file of temporaryConfigs) assert.equal(existsSync(file), false);
    let failedConfig;
    assert.throws(() =>
      r.guard(
        (command, args) => {
          if (args[0] === "get") return "kind-atlas-lab https://127.0.0.1:6443";
          failedConfig = args[1];
          throw Error("synthetic kubectl failure");
        },
        () => "kind-atlas-lab https://127.0.0.1:6443 ",
      ),
    );
    assert.equal(existsSync(failedConfig), false);
    const objects = r.secretObjects(r.localCredentials());
    let writes = 0;
    r.reconcileSecrets(objects, (args) => {
      if (args[0] === "get") return JSON.stringify({ items: objects });
      writes++;
    });
    assert.equal(writes, 0);
    assert.throws(() =>
      r.reconcileSecrets(objects, () =>
        JSON.stringify({
          items: [{ metadata: objects[0].metadata, data: { wrong: "value" } }],
        }),
      ),
    );
    r.reconcileSecrets(objects, (args) =>
      args[0] === "get" ? JSON.stringify({ items: [] }) : (writes++, ""),
    );
    assert.equal(writes, objects.length);
    assert.ok(r.token().split(".").length === 3);
    assert.ok(r.token("b"));
    assert.throws(() => r.token("other"));
    for (const action of [
      "doctor",
      "setup",
      "build",
      "up",
      "status",
      "logs",
      "stop",
    ])
      await r.main(action);
    const log = console.log;
    console.log = () => {};
    try {
      await r.main("token");
    } finally {
      console.log = log;
    }
    await assert.rejects(r.main("unknown"));
    writeFileSync(".local/tools/trivy", fake, { mode: 0o755 });
    await import("./security.mjs?fixture");
    r.stopForward(() => {
      const e = new Error("missing");
      e.code = "ENOENT";
      throw e;
    });
    assert.throws(() =>
      r.stopForward(() => {
        throw Error("unreadable");
      }),
    );
    assert.throws(() => r.stopForward(() => "invalid"));
    r.stopForward(
      () => "42",
      () => {
        throw Error("stale");
      },
    );
    r.stopForward(
      () => "42",
      () => "unrelated",
      () => assert.fail("unowned process"),
    );
    let killed = 0;
    r.stopForward(
      () => "42",
      () =>
        "kubectl --kubeconfig .local/k8s/kubeconfig --context kind-atlas-lab -n atlas-lab port-forward",
      () => killed++,
    );
    assert.equal(killed, 1);
    const child = r.forward();
    await once(child, "exit");
    await r.main("forward");
    await new Promise((resolve) => setTimeout(resolve, 100));
    await r.main("dev");
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.emit("SIGINT");
    process.emit("SIGTERM");
    // Drift must be rejected before executing a kubectl mutation.
    writeFileSync(".local/k8s/kubeconfig", "wrong");
    assert.throws(() => r.guard());
    process.exitCode = 0;
  } finally {
    process.chdir(original);
    process.env.PATH = oldPath;
    delete process.env.FAKE_MODE;
    rmSync(temp, { recursive: true, force: true });
  }
});

test("checked-in manifests match generated resources and least-privilege constraints", async () => {
  const { manifests } = await import("./manifests.mjs");
  const items = manifests();
  assert.deepEqual(
    JSON.parse(readFileSync("infra/k8s/resources.json")).items,
    items,
  );
  const workloads = items.filter((x) =>
    ["Deployment", "StatefulSet", "Job"].includes(x.kind),
  );
  for (const item of workloads) {
    const spec = item.spec.template.spec;
    assert.equal(spec.automountServiceAccountToken, false);
    assert.equal(spec.securityContext.runAsNonRoot, true);
    for (const c of spec.containers) {
      assert.equal(c.securityContext.allowPrivilegeEscalation, false);
      assert.ok(c.resources.limits);
      assert.notEqual(c.image.split(":").at(-1), "latest");
    }
  }
  assert.ok(
    items.some(
      (x) => x.kind === "NetworkPolicy" && x.metadata.name === "default-deny",
    ),
  );
  assert.equal(items.filter((x) => x.kind === "StatefulSet").length, 3);
  const brokerService = items.find(
    (x) => x.kind === "Service" && x.metadata.name === "kafka-client",
  );
  assert.deepEqual(brokerService.spec.selector, { app: "kafka" });
  assert.equal(brokerService.spec.clusterIP, undefined);
  assert.equal(brokerService.spec.ports[0].port, 19092);
  assert.equal(
    items.find((x) => x.kind === "Service" && x.metadata.name === "kafka").spec
      .clusterIP,
    "None",
  );
  for (const mode of ["allow", "deny"])
    assert.ok(
      items.some(
        (x) => x.kind === "Job" && x.metadata.name === `network-proof-${mode}`,
      ),
    );
  assert.equal(
    items.find(
      (x) => x.kind === "Deployment" && x.metadata.name === "processing-worker",
    ).spec.strategy.type,
    "Recreate",
  );
});

test("kind installer verifies pinned content and refuses unsupported/failed downloads", async () => {
  const { installKind } = await import("./install-kind.mjs");
  const { createHash } = await import("node:crypto");
  const binary = Buffer.from("synthetic installer fixture");
  const digest = createHash("sha256").update(binary).digest("hex");
  const pins = {
    kind: "0.33.0",
    kubectl: "1.35.8",
    kubectlChecksums: { "linux-amd64": digest },
    kindChecksums: { "kind-linux-amd64": digest, "kind-darwin-arm64": digest },
  };
  let writes = 0;
  const options = {
    pins,
    platform: "linux",
    architecture: "x64",
    fetcher: async () => ({ ok: true, arrayBuffer: async () => binary }),
    mkdir: () => {},
    write: () => writes++,
  };
  await installKind(options);
  await installKind({ ...options, platform: "darwin", architecture: "arm64" });
  await installKind({ ...options, tool: "kubectl" });
  assert.equal(writes, 3);
  await assert.rejects(installKind({ ...options, tool: "unsupported" }));
  await assert.rejects(installKind({ ...options, platform: "unsupported" }));
  await assert.rejects(
    installKind({ ...options, architecture: "unsupported" }),
  );
  await assert.rejects(
    installKind({ ...options, fetcher: async () => ({ ok: false }) }),
  );
  await assert.rejects(
    installKind({ ...options, pins: { kind: "0.33.0", kindChecksums: {} } }),
  );
});
