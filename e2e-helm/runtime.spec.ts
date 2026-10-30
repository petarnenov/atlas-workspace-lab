import {syntheticPdf as pdf} from '../e2e/fixtures/pdf';
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as helmRuntime from "../scripts/helm/runtime.mjs";
import {
  token as fixtureToken,
  execute,
  loadImages,
} from "../scripts/k8s/runtime.mjs";
import { writeFileSync } from "node:fs";

test.describe.configure({ mode: "serial" });
for (const env of ["dev", "prod"] as const)
  test.describe(`${env} Helm demo`, () => {
    test.use({ baseURL: `http://127.0.0.1:${env === "dev" ? 5173 : 5174}` });
    const kubectl = (args: string[], options?: any) =>
      helmRuntime.kube(env, args, options);
    const token = (tenant = "a") =>
      fixtureToken(tenant, helmRuntime.directory(env));
    const setup = () => helmRuntime.setup(env);
    const up = () => helmRuntime.up(env);
    const root = helmRuntime.directory(env);

        const file = () => ({
      name: "synthetic.pdf",
      mimeType: "application/pdf",
      buffer: pdf(),
    });
    const db = (sql: string, database = "assets") =>
      kubectl(
        [
          "exec",
          "statefulset/postgres",
          "--",
          "psql",
          "-U",
          "local_admin",
          "-d",
          database,
          "-Atc",
          sql,
        ],
        { quiet: true },
      ).trim();
    let assetId: string;
    async function completed(request: any, id: string) {
      await expect
        .poll(
          async () => {
            const r = await request.get(`/api/v1/assets/${id}`, {
              headers: { Authorization: `Bearer ${token()}` },
            });
            return (await r.json()).status;
          },
          { timeout: 80_000 },
        )
        .toBe("COMPLETED");
    }
    test("profile counts, isolated fixture identity and replica APIs", async ({
      request,
    }) => {
      for (const name of helmRuntime.applications) {
        const deployment = JSON.parse(
          kubectl(["get", "deployment", name, "-o", "json"], { quiet: true }),
        );
        expect(deployment.status.readyReplicas).toBe(
          env === "prod" && ["portal-ui", "workspace-api"].includes(name)
            ? 2
            : name === "docling-parser" ? 3 : 1,
        );
      }
      const other = env === "dev" ? "prod" : "dev";
      const response = await request.post("/api/v1/assets", {
        headers: {
          Authorization:
            "Bearer " + fixtureToken("a", helmRuntime.directory(other)),
        },
        multipart: { file: file() },
      });
      expect(response.status()).toBe(401);
      const pods = JSON.parse(
        kubectl(["get", "pods", "-l", "app=workspace-api", "-o", "json"], {
          quiet: true,
        }),
      ).items;
      for (const pod of pods) {
        const output = kubectl(
          [
            "exec",
            pod.metadata.name,
            "--",
            "java",
            "-Xmx32m",
            "-cp",
            "/app/probe",
            "NetworkCheck",
            "allow",
            "127.0.0.1:8080",
          ],
          { quiet: true },
        );
        expect(output).toBeDefined();
      }
    });
    test("static UI completes real upload through Kubernetes services", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByLabel("Synthetic demo token").fill(token());
      await page.getByLabel("Sample PDF").setInputFiles(file());
      const accepted = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" && r.url().endsWith("/api/v1/assets"),
      );
      await page.getByRole("button", { name: "Upload sample" }).click();
      const response = await accepted;
      expect(response.status()).toBe(202);
      assetId = (await response.json()).assetId;
      await expect(
        page.getByRole("heading", { name: "Processing complete" }),
      ).toBeVisible({ timeout: 60_000 });
      expect(
        db(
          `SELECT count(*) FROM checkpoint WHERE asset_id='${assetId}' AND sent=true`,
          "worker_checkpoint",
        ),
      ).toBe("1");
    });
    test("saved Docling copy is readable through API and Make with tenant isolation", async ({request}) => {
      const parsed = await request.get(`/api/v1/assets/${assetId}/parsed`,{headers:{Authorization:`Bearer ${token()}`}});
      expect(parsed.status()).toBe(200);
      expect(await parsed.text()).toContain("Atlas synthetic document");
      const structured = await request.get(`/api/v1/assets/${assetId}/parsed?format=json`,{headers:{Authorization:`Bearer ${token()}`}});
      expect((await structured.json()).schema_name).toBe("DoclingDocument");
      const forbidden = await request.get(`/api/v1/assets/${assetId}/parsed`,{headers:{Authorization:`Bearer ${token('b')}`}});
      expect(forbidden.status()).toBe(404);
      expect(execute("make",["parsed-copy",`ENV=${env}`,`ASSET_ID=${assetId}`],{quiet:true})).toContain("Atlas synthetic document");
      expect(db(`SELECT count(*) FROM parsed_document WHERE asset_id='${assetId}'`,"worker_checkpoint")).toBe("1");
    });
    test("parser deploy changes only its independent release", async () => {
      const before=JSON.parse(helmRuntime.helm(env,["list","-o","json"]));
      helmRuntime.deploy(env,"docling-parser");
      const after=JSON.parse(helmRuntime.helm(env,["list","-o","json"]));
      for(const release of before) {
        const current=after.find((item:any)=>item.name===release.name);
        expect(Number(current.revision)).toBe(Number(release.revision)+(release.name==="atlas-docling-parser"?1:0));
      }
    });
    test("identity and tenant denial plus idempotency hold in Kubernetes", async ({
      request,
    }) => {
      const headers = {
        Authorization: `Bearer ${token()}`,
        "Idempotency-Key": randomUUID(),
      };
      const first = await request.post("/api/v1/assets", {
        headers,
        multipart: { file: file() },
      });
      expect(first.status()).toBe(202);
      const receipt = await first.json();
      const second = await request.post("/api/v1/assets", {
        headers,
        multipart: { file: file() },
      });
      expect(await second.json()).toEqual(receipt);
      expect(
        (await request.get(`/api/v1/assets/${receipt.assetId}`)).status(),
      ).toBe(401);
      expect(
        (
          await request.get(`/api/v1/assets/${receipt.assetId}`, {
            headers: { Authorization: `Bearer ${token("b")}` },
          })
        ).status(),
      ).toBe(404);
      const malformed = await request.post("/api/v1/assets", {
        headers: { Authorization: headers.Authorization },
        multipart: {
          file: {
            ...file(),
            buffer: Buffer.from("%PDF-1.7 synthetic invalid"),
          },
        },
      });
      expect(malformed.status()).toBe(202);
      const bad = await malformed.json();
      await expect
        .poll(
          async () =>
            (
              await (
                await request.get(`/api/v1/assets/${bad.assetId}`, {
                  headers: { Authorization: headers.Authorization },
                })
              ).json()
            ).status,
          // The serial worker may still be converting the preceding valid upload.
          { timeout: 80_000 },
        )
        .toBe("FAILED");
      await completed(request, receipt.assetId);
    });
    test("worker restart and duplicate Kafka delivery preserve terminal state", async ({
      request,
    }) => {
      expect(assetId).toBeTruthy();
      kubectl(["rollout", "restart", "deployment/processing-worker"]);
      kubectl([
        "rollout",
        "status",
        "deployment/processing-worker",
        "--timeout=180s",
      ]);
      const payload = db(
        `SELECT payload FROM upload_outbox WHERE asset_id='${assetId}'`,
      );
      kubectl(
        [
          "exec",
          "-i",
          "statefulset/kafka",
          "--",
          "/opt/kafka/bin/kafka-console-producer.sh",
          "--bootstrap-server",
          "localhost:19092",
          "--topic",
          "asset.uploaded.v1",
          "--property",
          "parse.key=true",
          "--property",
          "key.separator=\t",
        ],
        {
          input: `${assetId}\t${payload}\n${assetId}\t${payload}\n`,
          quiet: true,
        },
      );
      await completed(request, assetId);
      expect(
        db(
          `SELECT count(*) FROM checkpoint WHERE asset_id='${assetId}'`,
          "worker_checkpoint",
        ),
      ).toBe("1");
      expect(db(`SELECT version FROM asset WHERE asset_id='${assetId}'`)).toBe(
        "2",
      );
    });
    test("default deny blocks unrelated pods while authorized connections work", async () => {
      kubectl(
        [
          "exec",
          "deployment/asset-service",
          "--",
          "java",
          "-Xmx32m",
          "-cp",
          "/app/probe",
          "NetworkCheck",
          "allow",
          "postgres:5432",
          "kafka-client:19092",
          "storage:9000",
        ],
        { quiet: true },
      );
      const images = JSON.parse(readFileSync(`${root}/images.json`, "utf8"));
      const job = {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
          name: "network-denial",
          namespace: helmRuntime.namespace(env),
        },
        spec: {
          backoffLimit: 0,
          activeDeadlineSeconds: 60,
          template: {
            metadata: { labels: { app: "network-denial" } },
            spec: {
              automountServiceAccountToken: false,
              restartPolicy: "Never",
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 10001,
                seccompProfile: { type: "RuntimeDefault" },
              },
              containers: [
                {
                  name: "probe",
                  image: images["asset-service"],
                  imagePullPolicy: "Never",
                  command: [
                    "java",
                    "-Xmx32m",
                    "-cp",
                    "/app/probe",
                    "NetworkCheck",
                    "deny",
                    "postgres:5432",
                    "kafka-client:19092",
                    "storage:9000",
                  ],
                  securityContext: {
                    readOnlyRootFilesystem: true,
                    allowPrivilegeEscalation: false,
                    capabilities: { drop: ["ALL"] },
                  },
                  resources: {
                    requests: { cpu: "50m", memory: "64Mi" },
                    limits: { cpu: "500m", memory: "128Mi" },
                  },
                },
              ],
            },
          },
        },
      };
      kubectl(["delete", "job", "network-denial", "--ignore-not-found"]);
      kubectl(["create", "-f", "-"], { input: JSON.stringify(job) });
      try {
        kubectl([
          "wait",
          "--for=condition=complete",
          "job/network-denial",
          "--timeout=70s",
        ]);
      } finally {
        kubectl(["delete", "job", "network-denial", "--ignore-not-found"]);
      }
    });
    test("repeated reconciliation and stateful pod recreation preserve stored objects and receipts", async ({
      request,
    }) => {
      test.setTimeout(360_000);
      setup();
      up();
      const brokerAddress = () =>
        kubectl(
          [
            "get",
            "service",
            "kafka-client",
            "-o",
            "jsonpath={.spec.clusterIP}",
          ],
          { quiet: true },
        ).trim();
      const stableAddress = brokerAddress();
      expect(stableAddress).not.toBe("None");
      expect(stableAddress).not.toBe("");
      const before = db(
        `SELECT payload FROM upload_outbox WHERE asset_id='${assetId}'`,
      );
      for (const name of ["postgres", "storage", "kafka"]) {
        kubectl(["delete", "pod", `${name}-0`]);
        kubectl(["rollout", "status", `statefulset/${name}`, "--timeout=180s"]);
      }
      expect(brokerAddress()).toBe(stableAddress);
      await completed(request, assetId);
      expect(
        db(`SELECT payload FROM upload_outbox WHERE asset_id='${assetId}'`),
      ).toBe(before);
      // A new upload proves all dependencies recovered; S3 retrieval occurs in the real worker.
      const upload = await request.post("/api/v1/assets", {
        headers: { Authorization: `Bearer ${token()}` },
        multipart: { file: file() },
      });
      expect(upload.status()).toBe(202);
      await completed(request, (await upload.json()).assetId);
    });
    test("single app upgrade and explicit rollback preserve other releases", async ({
      request,
    }) => {
      test.setTimeout(240_000);
      const revisions = () =>
        Object.fromEntries(
          ["dev", "prod"].flatMap((e) =>
            JSON.parse(helmRuntime.helm(e, ["list", "-o", "json"])).map(
              (r: any) => [e + "/" + r.name, r.revision],
            ),
          ),
        );
      const before = revisions();
      const inventory = helmRuntime.images(env);
      const image = inventory["workspace-api"];
      execute(
        "docker",
        ["build", "--provenance=false", "-t", "atlas/helm-test:candidate", "-"],
        {
          input:
            "FROM " +
            image +
            "\nLABEL org.atlas-lab.upgrade=" +
            randomUUID() +
            "\n",
          quiet: true,
        },
      );
      const id = execute(
        "docker",
        [
          "image",
          "inspect",
          "atlas/helm-test:candidate",
          "--format",
          "{{.Id}}",
        ],
        { quiet: true },
      ).trim();
      const variant = "atlas/workspace-api:" + id.replace("sha256:", "");
      execute("docker", ["tag", "atlas/helm-test:candidate", variant]);
      loadImages([variant]);
      inventory["workspace-api"] = variant;
      writeFileSync(root + "/images.json", JSON.stringify(inventory), {
        mode: 0o600,
      });
      helmRuntime.deploy(env, "workspace-api");
      const after = revisions();
      for (const [key, value] of Object.entries(before))
        if (key !== env + "/atlas-workspace-api")
          expect(after[key]).toBe(value);
      expect(Number(after[env + "/atlas-workspace-api"])).toBeGreaterThan(
        Number(before[env + "/atlas-workspace-api"]),
      );
      // Pod readiness alone does not prove end-to-end routing recovery. Require
      // actual end-to-end recovery within a bounded window, not zero downtime.
      await expect
        .poll(
          async () =>
            (
              await request.get(`/api/v1/assets/${assetId}`, {
                headers: { Authorization: `Bearer ${token()}` },
                timeout: 10_000,
              })
            ).status(),
          { timeout: 40_000 },
        )
        .toBe(200);
      helmRuntime.rollback(
        env,
        "workspace-api",
        before[env + "/atlas-workspace-api"],
      );
      const rolled = revisions();
      for (const [key, value] of Object.entries(before))
        if (key !== env + "/atlas-workspace-api")
          expect(rolled[key]).toBe(value);
      expect(helmRuntime.images(env)["workspace-api"]).toBe(image);
      // Pod readiness alone does not prove end-to-end routing recovery. Require
      // actual end-to-end recovery within a bounded window, not zero downtime.
      await expect
        .poll(
          async () =>
            (
              await request.get(`/api/v1/assets/${assetId}`, {
                headers: { Authorization: `Bearer ${token()}` },
                timeout: 10_000,
              })
            ).status(),
          { timeout: 40_000 },
        )
        .toBe(200);
    });
    test("stop/up retains PVCs and restores the complete runtime", async () => {
      test.setTimeout(360_000);
      const before = JSON.parse(
        kubectl(["get", "pvc", "-o", "json"], { quiet: true }),
      )
        .items.map((x: any) => x.metadata.uid)
        .sort();
      helmRuntime.stop(env);
      kubectl([
        "wait",
        "--for=delete",
        "pod",
        "-l",
        "app in (workspace-api,asset-service,processing-worker,portal-ui,postgres,kafka,storage)",
        "--timeout=120s",
      ]);
      up();
      expect(db(`SELECT status FROM asset WHERE asset_id='${assetId}'`)).toBe(
        "COMPLETED",
      );
      kubectl(
        [
          "exec",
          "deployment/portal-ui",
          "--",
          "wget",
          "-qO",
          "/dev/null",
          "http://127.0.0.1:8080",
        ],
        { quiet: true },
      );
      const after = JSON.parse(
        kubectl(["get", "pvc", "-o", "json"], { quiet: true }),
      )
        .items.map((x: any) => x.metadata.uid)
        .sort();
      expect(after).toEqual(before);
    });

    test("runtime database and object credentials remain scoped after recovery", async () => {
      for (const [password, role, database] of [
        ["WORKER_DB_PASSWORD", "worker_owner", "assets"],
        ["ASSET_DB_PASSWORD", "asset_owner", "worker_checkpoint"],
      ]) {
        expect(() =>
          kubectl(
            [
              "exec",
              "statefulset/postgres",
              "--",
              "/bin/sh",
              "-ec",
              `PGPASSWORD="$${password}" psql -h 127.0.0.1 -U ${role} -d ${database} -c 'SELECT 1'`,
            ],
            { quiet: true, sensitive: true },
          ),
        ).toThrow();
      }
      const key = db(
        `SELECT object_key FROM asset WHERE asset_id='${assetId}'`,
      );
      expect(key).toMatch(/^[a-zA-Z0-9/._-]+$/);
      const images = JSON.parse(readFileSync(`${root}/images.json`, "utf8"));
      const job = {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
          name: "object-scope-proof",
          namespace: helmRuntime.namespace(env),
        },
        spec: {
          backoffLimit: 0,
          activeDeadlineSeconds: 60,
          template: {
            metadata: { labels: { app: "processing-worker" } },
            spec: {
              automountServiceAccountToken: false,
              restartPolicy: "Never",
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 10001,
                fsGroup: 10001,
                seccompProfile: { type: "RuntimeDefault" },
              },
              containers: [
                {
                  name: "proof",
                  image: images["storage-init"],
                  imagePullPolicy: "Never",
                  command: [
                    "/bin/sh",
                    "-ec",
                    `rc alias set proof http://storage:9000 worker_reader "$LAB_WORKER_OBJECT_PASSWORD" >/dev/null; rc stat proof/synthetic-assets/${key} >/dev/null; printf synthetic >/tmp/input; if rc cp /tmp/input proof/synthetic-assets/forbidden-test-write >/dev/null 2>&1; then exit 1; fi`,
                  ],
                  env: [
                    { name: "HOME", value: "/tmp" },
                    {
                      name: "LAB_WORKER_OBJECT_PASSWORD",
                      valueFrom: {
                        secretKeyRef: {
                          name: "worker-runtime",
                          key: "LAB_WORKER_OBJECT_PASSWORD",
                        },
                      },
                    },
                  ],
                  volumeMounts: [{ name: "tmp", mountPath: "/tmp" }],
                  securityContext: {
                    readOnlyRootFilesystem: true,
                    allowPrivilegeEscalation: false,
                    capabilities: { drop: ["ALL"] },
                  },
                  resources: {
                    requests: { cpu: "50m", memory: "64Mi" },
                    limits: { cpu: "500m", memory: "128Mi" },
                  },
                },
              ],
              volumes: [{ name: "tmp", emptyDir: {} }],
            },
          },
        },
      };
      kubectl(["delete", "job", "object-scope-proof", "--ignore-not-found"]);
      kubectl(["create", "-f", "-"], { input: JSON.stringify(job) });
      try {
        kubectl([
          "wait",
          "--for=condition=complete",
          "job/object-scope-proof",
          "--timeout=70s",
        ]);
      } finally {
        kubectl(["delete", "job", "object-scope-proof", "--ignore-not-found"]);
      }
    });
  });

test("authorized app labels cannot cross environment database, broker or object boundaries", async () => {
  for (const env of ["dev", "prod"] as const) {
    const other = env === "dev" ? "prod" : "dev";
    const targets = [
      ["postgres", 5432],
      ["kafka-client", 19092],
      ["storage", 9000],
    ].map(([name, port]) => {
      const address = helmRuntime
        .kube(
          other,
          ["get", "service", String(name), "-o", "jsonpath={.spec.clusterIP}"],
          { quiet: true },
        )
        .trim();
      return `${address}:${port}`;
    });
    const job = helmRuntime
      .render(env)
      .find(
        (x: any) =>
          x.kind === "Job" && x.metadata.name.endsWith("network-proof-allow"),
      );
    job.metadata = {
      name: "cross-environment-proof",
      namespace: helmRuntime.namespace(env),
    };
    job.spec.template.spec.containers[0].command = [
      "java",
      "-Xmx32m",
      "-cp",
      "/app/probe",
      "NetworkCheck",
      "deny",
      ...targets,
    ];
    try {
      helmRuntime.kube(env, ["create", "-f", "-"], {
        input: JSON.stringify(job),
      });
      helmRuntime.kube(env, [
        "wait",
        "--for=condition=complete",
        "job/cross-environment-proof",
        "--timeout=70s",
      ]);
    } finally {
      helmRuntime.kube(env, [
        "delete",
        "job",
        "cross-environment-proof",
        "--ignore-not-found",
      ]);
    }
  }
});
