import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";

test("Helm environment isolation, release ownership, failure gates and independent lifecycle", async () => {
  const original = process.cwd(),
    oldPath = process.env.PATH;
  const temp = mkdtempSync(resolve(tmpdir(), "atlas-helm-tests-"));
  cpSync("infra", `${temp}/infra`, { recursive: true });
  for (const d of [".local/tools", ".local/k8s", "bin", "apps/portal-ui/dist"])
    mkdirSync(`${temp}/${d}`, { recursive: true });
  const fake = `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const name=path.basename(process.argv[1]),args=process.argv.slice(2),s=args.join(' '),mode=process.env.HELM_TEST_MODE;
fs.appendFileSync('.local/calls.log',name+' '+s+'\\n');
if(mode==='fail')process.exit(9);
const ns=args[args.indexOf('--namespace')+1]||'atlas-dev';
const stateFile='.local/state.json';let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{};
const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state));
if(name==='kind'){
 if(s==='version')console.log('kind v0.33.0');
 else if(s==='get clusters')console.log('atlas-lab');
 else if(s.startsWith('get kubeconfig'))console.log('kind-atlas-lab https://127.0.0.1:6443');
}else if(name==='kubectl'){
 if(s==='version --client -o json')console.log(JSON.stringify({clientVersion:{major:'1',minor:'35'}}));
 else if(args.includes('port-forward')){console.log('forward-ready');setInterval(()=>{},1000);}
 else if(s.includes('get namespace')){
  const target=args[args.indexOf('namespace')+1];
  if(mode==='namespace-mismatch')console.log(JSON.stringify({metadata:{name:target,labels:{}}}));
  else if(state[target])console.log(JSON.stringify(state[target].namespace));
 }
 else if(s.includes('get secrets')){
  if(!args.includes('--ignore-not-found')||!args.includes('artifact-owner'))process.exit(31);
  let items=state[ns]?.secrets||[];
  if(mode==='secrets-mismatch')items=[];
  console.log(JSON.stringify({items}));
 }
 else if(s.includes('get deployments,statefulsets'))console.log(JSON.stringify({items:mode==='collision'?[{kind:'Deployment',metadata:{name:'workspace-api',labels:{}}}]:[]}));
 else if(s.includes('get statefulsets'))console.log(JSON.stringify({items:['postgres','kafka','storage'].map(name=>({metadata:{name},spec:{replicas:1},status:{readyReplicas:mode==='dependencies-unready'?0:1}}))}));
 else if(args.includes('create')){
  const o=JSON.parse(fs.readFileSync(0,'utf8'));
  if(o.kind==='Namespace')state[o.metadata.name]={namespace:o,secrets:[],releases:{}};
  else if(o.kind==='Secret')state[ns].secrets.push(o);
  save();
 }
}else if(name==='helm'){
 if(args[0]==='template'||args[0]==='lint'){
  const result=cp.spawnSync(${JSON.stringify(resolve(original, ".local/tools/helm"))},args,{input:fs.readFileSync(0),encoding:'utf8'});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exit(result.status??1);
 }
 else if(args[0]==='version')console.log(mode==='old-helm'?'v4.0.0+test':'v4.3.1+test');
 else {
  const get=(r)=>state[ns].releases[r];
  if(args.includes('upgrade')){
   const r=args[args.indexOf('--install')+1];if(mode==='platform-failure'&&r==='atlas-platform')process.exit(8);
   const values=JSON.parse(fs.readFileSync(0,'utf8'));const previous=get(r)||[];
   for(const item of previous)item.status='superseded';
   previous.push({revision:previous.length+1,status:'deployed',chart:r==='atlas-platform'?'atlas-platform-0.1.0':'atlas-component-0.1.0',values});
   state[ns].releases[r]=previous;save();
  }
  else if(args.includes('list'))console.log(JSON.stringify(Object.entries(state[ns].releases).map(([name,items])=>({name,revision:String(items.length)}))));
  else if(args.includes('status'))console.log(JSON.stringify({info:{status:mode==='platform-unready'?'failed':'deployed'}}));
  else if(args.includes('history'))console.log(JSON.stringify(get(args[args.indexOf('history')+1])||[]));
  else if(args.includes('get')){
   const rows=get(args[args.indexOf('values')+1]);const revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):rows.length;
   console.log(JSON.stringify(rows[revision-1].values));
  }
  else if(args.includes('rollback')){
   const r=args[args.indexOf('rollback')+1],revision=Number(args[args.indexOf('rollback')+2]),rows=get(r);const values=rows[revision-1].values;
   rows.forEach(x=>x.status='superseded');rows.push({revision:rows.length+1,status:'deployed',chart:'atlas-component-0.1.0',values});save();
  }
 }
}else if(name==='docker'){
 if(s==='info --format {{.Architecture}}')console.log('x86_64');
 else if(args[0]==='info')console.log(JSON.stringify({NCPU:8,MemTotal:(mode==='low-memory'?8:16)*1024**3}));
 else if(args.includes('inspect'))console.log('sha256:'+'a'.repeat(64));
 else if(args.includes('save'))fs.writeFileSync(args[args.indexOf('--output')+1],'fixture');
}else if(name==='java')console.log('openjdk 21.0.1');else if(name==='javac')console.log('javac 21.0.1');else if(name==='pnpm')console.log('10.0.0');
else if(name==='trivy'&&args.includes('--output'))fs.writeFileSync(args[args.indexOf('--output')+1],JSON.stringify({Results:[{Type:mode==='not-scanned'?'unknown':'kubernetes'}]}));
`;
  for (const n of [
    "helm",
    "kubectl",
    "kind",
    "docker",
    "java",
    "javac",
    "pnpm",
    "make",
    "trivy",
  ])
    writeFileSync(
      `${temp}/${["helm", "kubectl", "kind", "trivy"].includes(n) ? ".local/tools" : "bin"}/${n}`,
      fake,
      { mode: 0o755 },
    );
  writeFileSync(
    `${temp}/.local/k8s/kubeconfig`,
    "kind-atlas-lab https://127.0.0.1:6443\n",
  );
  for (const [name, dir] of [
    ["workspace-api", "services"],
    ["asset-service", "services"],
    ["processing-worker", "workers"],
  ]) {
    mkdirSync(`${temp}/${dir}/${name}/build/libs`, { recursive: true });
    writeFileSync(
      `${temp}/${dir}/${name}/build/libs/${name}-0.1.0-SNAPSHOT.jar`,
      "fixture",
    );
  }
  writeFileSync(
    `${temp}/workers/processing-worker/build/libs/processing-worker-0.1.0-SNAPSHOT-parser.jar`,
    "fixture",
  );
  process.chdir(temp);
  process.env.PATH = `${temp}/bin:${oldPath}`;
  try {
    const r = await import("./runtime.mjs");
    assert.throws(() => r.environment("real-prod"));
    assert.throws(() => r.component("platform"));
    assert.throws(() => r.component("--force"));
    assert.equal(r.environment(), "dev");
    assert.equal(r.release("platform"), "atlas-platform");
    assert.throws(() =>
      r.validateConfiguration("dev", "workspace-api", { environment: "prod" }),
    );
    assert.throws(() => r.validateNamespace("dev", {}));
    assert.throws(() => r.images("dev"));
    r.setup("dev");
    r.setup("prod");
    r.setup("dev");
    assert.notEqual(
      readFileSync(`${r.directory("dev")}/fixture-public.pem`, "utf8"),
      readFileSync(`${r.directory("prod")}/fixture-public.pem`, "utf8"),
    );
    r.build("dev");
    r.build("prod");
    r.lint("dev");
    r.lint("prod");
    const baseline = (await import("../k8s/runtime.mjs")).rendered(
      r.images("dev"),
    );
    for (const env of ["dev", "prod"]) {
      for (const service of ["platform", ...r.applications]) {
        const configuration = r.values(env, service);
        for (const bad of [
          { ...configuration, environment: "other" },
          { ...configuration, syntheticDemo: false },
          {
            ...configuration,
            images: { ...configuration.images, "workspace-api": "latest" },
          },
          {
            ...configuration,
            replicas: { ...configuration.replicas, "processing-worker": 2 },
          },
        ])
          assert.throws(() => r.render(env, service, bad));
        for (const item of r.render(env, service)) {
          const name = item.metadata.name.replace(/^atlas-platform-/, "");
          const old = baseline.find(
            (x) => x.kind === item.kind && x.metadata.name === name,
          );
          assert.ok(
            old,
            "every chart resource has an approved native counterpart",
          );
          if (item.kind === "NetworkPolicy")
            assert.deepEqual(item.spec, old.spec);
          if (["Deployment", "StatefulSet", "Job"].includes(item.kind)) {
            assert.deepEqual(
              item.spec.template.spec.securityContext,
              old.spec.template.spec.securityContext,
            );
            for (
              let i = 0;
              i < item.spec.template.spec.containers.length;
              i++
            ) {
              const c = item.spec.template.spec.containers[i],
                previous = old.spec.template.spec.containers[i];
              assert.deepEqual(c.securityContext, previous.securityContext);
              assert.deepEqual([...c.env ?? []].sort((a,b)=>a.name.localeCompare(b.name)), [...previous.env ?? []].sort((a,b)=>a.name.localeCompare(b.name)));
              assert.deepEqual([...c.volumeMounts ?? []].sort((a,b)=>a.name.localeCompare(b.name)), [...previous.volumeMounts ?? []].sort((a,b)=>a.name.localeCompare(b.name)));
              assert.deepEqual(c.readinessProbe, previous.readinessProbe);
            }
          }
        }
      }
    }

    const all = [
      ...r.render("dev"),
      ...r.applications.flatMap((s) => r.render("dev", s)),
    ];
    assert.ok(
      all.every(
        (x) => x.metadata.namespace === "atlas-dev" && x.kind !== "Secret",
      ),
    );
    assert.deepEqual(
      r
        .parseManifests(
          '# source\n{ "kind":"Service" }\n---\n# second\n{"kind":"Job"}',
        )
        .map((x) => x.kind),
      ["Service", "Job"],
    );
    r.up("dev");
    r.up("prod");
    const before = readFileSync(".local/state.json", "utf8");
    r.deploy("dev", "workspace-api");
    const after = JSON.parse(readFileSync(".local/state.json"));
    assert.equal(after["atlas-dev"].releases["atlas-workspace-api"].length, 2);
    assert.deepEqual(after["atlas-prod"], JSON.parse(before)["atlas-prod"]);
    for (const s of [
      "platform",
      "portal-ui",
      "asset-service",
      "processing-worker",
    ])
      assert.equal(after["atlas-dev"].releases[r.release(s)].length, 1);
    r.rollback("dev", "workspace-api", "1");
    assert.throws(() => r.rollback("dev", "platform", "1"));
    assert.throws(() => r.rollback("dev", "workspace-api", "0"));
    assert.throws(() => r.rollback("dev", "workspace-api", "999"));
    for (const mode of [
      "namespace-mismatch",
      "secrets-mismatch",
      "collision",
      "platform-unready",
      "dependencies-unready",
    ]) {
      process.env.HELM_TEST_MODE = mode;
      assert.throws(() => r.deploy("dev", "workspace-api"));
    }
    process.env.HELM_TEST_MODE = "platform-failure";
    assert.throws(() => r.up("dev"));
    delete process.env.HELM_TEST_MODE;
    for (const mode of ["old-helm", "low-memory"]) {
      process.env.HELM_TEST_MODE = mode;
      assert.throws(() => r.doctor("dev"));
    }
    delete process.env.HELM_TEST_MODE;
    const native = await import("../k8s/runtime.mjs");
    writeFileSync(".local/k8s/kubeconfig", "unrelated-context");
    assert.throws(() => r.kube("dev", ["get", "pods"]));
    writeFileSync(
      ".local/k8s/kubeconfig",
      "kind-atlas-lab https://127.0.0.1:6443\n",
    );
    await native.withOperation(async () => {
      await assert.rejects(native.withOperation(() => r.up("prod")));
    });
    r.stop("dev");
    assert.throws(() => r.deploy("dev", "workspace-api"));
    assert.throws(() => r.rollback("dev", "workspace-api", "4"));
    r.up("dev");
    const inv = r.images("dev");
    writeFileSync(
      `${r.directory("dev")}/images.json`,
      JSON.stringify({ ...inv, "workspace-api": "latest" }),
    );
    assert.throws(() => r.images("dev"));
    writeFileSync(`${r.directory("dev")}/images.json`, JSON.stringify(inv));
    // Existing namespaces without local state fail instead of re-keying persisted data.
    const credentials = readFileSync(`${r.directory("dev")}/credentials.json`);
    rmSync(`${r.directory("dev")}/credentials.json`);
    assert.throws(() => r.setup("dev"));
    writeFileSync(`${r.directory("dev")}/credentials.json`, credentials);
    const { runSecurity } = await import("./security.mjs");
    runSecurity();
    process.env.HELM_TEST_MODE = "not-scanned";
    assert.throws(() => runSecurity());
    delete process.env.HELM_TEST_MODE;
    for (const action of [
      "doctor",
      "status",
      "logs",
      "lint",
      "template",
      "setup",
      "build",
      "up",
      "deploy",
      "stop",
    ]) {
      const log = console.log;
      console.log = () => {};
      try {
        await r.main(action, "dev", "workspace-api");
      } finally {
        console.log = log;
      }
    }
    process.env.REVISION = "1";
    await r.main("rollback", "dev", "workspace-api");
    delete process.env.REVISION;
    const log = console.log;
    console.log = () => {};
    try {
      await r.main("token", "dev");
    } finally {
      console.log = log;
    }
    await assert.rejects(r.main("unknown", "dev"));
    // Forwarding ownership: never kill an unrelated PID or another namespace.
    r.stopForward("dev", () => {
      const e = Error();
      e.code = "ENOENT";
      throw e;
    });
    assert.throws(() => r.stopForward("dev", () => "1"));
    r.stopForward(
      "dev",
      () => "999999",
      () => {
        throw Error("gone");
      },
    );
    let killed = 0;
    r.stopForward(
      "dev",
      () => "1234",
      () => "unrelated kubectl",
      () => killed++,
    );
    assert.equal(killed, 0);
    r.stopForward(
      "dev",
      () => "1234",
      () =>
        "kubectl --kubeconfig .local/k8s/kubeconfig --context kind-atlas-lab -n atlas-dev port-forward",
      () => killed++,
    );
    assert.equal(killed, 1);
    const child = r.forward("dev");
    await once(child, "spawn");
    child.kill("SIGTERM");
    await once(child, "exit");
    await r.main("forward", "prod");
    const pid = Number(readFileSync(`${r.directory("prod")}/forward.pid`));
    process.kill(pid, "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    delete process.env.HELM_TEST_MODE;
    process.env.PATH = oldPath;
    process.chdir(original);
    rmSync(temp, { recursive: true, force: true });
  }
});

test("Helm download is verified before extraction and cleans temporary state", async () => {
  const { installHelm } = await import("./install.mjs");
  const bytes = Buffer.from("synthetic verified distribution");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const response = { ok: true, arrayBuffer: async () => bytes };
  const pins = { helm: "4.3.1", checksums: { "linux-amd64": digest } };
  const original = process.cwd(),
    temp = mkdtempSync(resolve(tmpdir(), "atlas-helm-installer-"));
  process.chdir(temp);
  try {
    await assert.rejects(
      installHelm({ platform: "win32", architecture: "x64" }),
    );
    await assert.rejects(
      installHelm({
        platform: "linux",
        architecture: "x64",
        pins,
        fetcher: async () => ({ ok: false }),
      }),
    );
    await assert.rejects(
      installHelm({
        platform: "linux",
        architecture: "x64",
        pins: { ...pins, checksums: {} },
        fetcher: async () => response,
      }),
    );
    let extraction;
    const run = (command, args) => {
      extraction = args[3];
      mkdirSync(`${extraction}/linux-amd64`);
      writeFileSync(`${extraction}/linux-amd64/helm`, "fixture");
    };
    await installHelm({
      platform: "linux",
      architecture: "x64",
      pins,
      fetcher: async () => response,
      run,
    });
    assert.equal(existsSync(extraction), false);
    assert.equal(readFileSync(".local/tools/helm", "utf8"), "fixture");
    await assert.rejects(
      installHelm({
        platform: "linux",
        architecture: "x64",
        pins,
        fetcher: async () => response,
        run: () => {
          throw Error("extract failed");
        },
      }),
    );
  } finally {
    process.chdir(original);
    rmSync(temp, { recursive: true, force: true });
  }
});
