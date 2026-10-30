import {syntheticPdf as pdf} from '../e2e/fixtures/pdf';
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { kubectl, token, up, setup, root } from "../scripts/k8s/runtime.mjs";

test.describe.configure({ mode: "serial" });

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
      file: { ...file(), buffer: Buffer.from("%PDF-1.7 synthetic invalid") },
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
    { input: `${assetId}\t${payload}\n${assetId}\t${payload}\n`, quiet: true },
  );
  await completed(request, assetId);
  expect(
    db(
      `SELECT count(*) FROM checkpoint WHERE asset_id='${assetId}'`,
      "worker_checkpoint",
    ),
  ).toBe("1");
  expect(db(`SELECT version FROM asset WHERE asset_id='${assetId}'`)).toBe("2");
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
    metadata: { name: "network-denial", namespace: "atlas-lab" },
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
      ["get", "service", "kafka-client", "-o", "jsonpath={.spec.clusterIP}"],
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
test("stop/up retains PVCs and restores the complete runtime", async () => {
  test.setTimeout(360_000);
  const before = JSON.parse(
    kubectl(["get", "pvc", "-o", "json"], { quiet: true }),
  )
    .items.map((x: any) => x.metadata.uid)
    .sort();
  kubectl(["scale", "deployments", "--all", "--replicas=0"]);
  kubectl(["scale", "statefulsets", "--all", "--replicas=0"]);
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
  const key = db(`SELECT object_key FROM asset WHERE asset_id='${assetId}'`);
  expect(key).toMatch(/^[a-zA-Z0-9/._-]+$/);
  const images = JSON.parse(readFileSync(`${root}/images.json`, "utf8"));
  const job = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: "object-scope-proof", namespace: "atlas-lab" },
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
