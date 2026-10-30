import {syntheticPdf as pdf} from './fixtures/pdf';
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { sign, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import Ajv from "ajv/dist/2020.js";
import formats from "ajv-formats";
const ajv = new Ajv({ strict: false });
formats(ajv);
ajv.addFormat("binary", true);
for (const name of ["asset-api", "asset-internal"])
  ajv.addSchema(
    JSON.parse(readFileSync(`contracts/openapi/${name}.v1.json`, "utf8")),
    name,
  );
const events = JSON.parse(
  readFileSync("contracts/asyncapi/asset-events.v1.json", "utf8"),
);
function token(tenant = "a") {
  const now = Math.floor(Date.now() / 1000);
  const encode = (x: unknown) =>
    Buffer.from(JSON.stringify(x)).toString("base64url");
  const value = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: "lab-fixture", aud: "workspace-api", sub: "synthetic-user", tenantId: tenant === "a" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222", iat: now, nbf: now, exp: now + 300 })}`;
  return `${value}.${sign("RSA-SHA256", Buffer.from(value), readFileSync(".local/fixture-private.pem")).toString("base64url")}`;
}
const uploadFile = (
  buffer = pdf(),
  name = "synthetic.pdf",
  mimeType = "application/pdf",
) => ({ name, mimeType, buffer });
function contract(name: string, schema: string, value: unknown) {
  const check = ajv.getSchema(`${name}#/components/schemas/${schema}`)!;
  expect(check(value), JSON.stringify(check.errors)).toBe(true);
}
function db(sql: string, database = "assets") {
  return execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "local_admin",
      "-d",
      database,
      "-Atc",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}
test("real UI upload reaches completed through Kafka and bounded PDF worker", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Synthetic demo token").fill(token());
  await page.getByLabel("Sample PDF").setInputFiles(uploadFile());
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/assets") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Upload sample" }).click();
  const accepted = await response;
  expect(accepted.status()).toBe(202);
  const receipt = await accepted.json();
  contract("asset-api", "AssetReceipt", receipt);
  contract("asset-internal", "AssetReceipt", receipt);
  await expect(
    page.getByRole("heading", { name: "Processing complete" }),
  ).toBeVisible({ timeout: 40_000 });
  const parsed = await page.request.get(`/api/v1/assets/${receipt.assetId}/parsed`, {headers:{Authorization:`Bearer ${token()}`}});
  expect(parsed.status()).toBe(200);
  expect(await parsed.text()).toContain('Atlas synthetic document');
  const foreign = await page.request.get(`/api/v1/assets/${receipt.assetId}/parsed`, {headers:{Authorization:`Bearer ${token('b')}`} });
  expect(foreign.status()).toBe(404);
  const uploaded = JSON.parse(
    db(`SELECT payload FROM upload_outbox WHERE asset_id='${receipt.assetId}'`),
  );
  const outcome = JSON.parse(
    db(
      `SELECT outcome FROM checkpoint WHERE asset_id='${receipt.assetId}'`,
      "worker_checkpoint",
    ),
  );
  expect(
    ajv.compile(events.components.messages.AssetUploaded.payload)(uploaded),
  ).toBe(true);
  expect(
    ajv.compile(events.components.messages.AssetProcessed.payload)(outcome),
  ).toBe(true);
});
test("tenant denial, idempotent retry and malformed PDF processing failure", async ({
  request,
}) => {
  const auth = {
    Authorization: `Bearer ${token()}`,
    "Idempotency-Key": randomUUID(),
  };
  const first = await request.post("/api/v1/assets", {
    headers: auth,
    multipart: { file: uploadFile() },
  });
  expect(first.status()).toBe(202);
  const receipt = await first.json();
  const replay = await request.post("/api/v1/assets", {
    headers: auth,
    multipart: { file: uploadFile() },
  });
  expect(await replay.json()).toEqual(receipt);
  const denied = await request.get(`/api/v1/assets/${receipt.assetId}`, {
    headers: {
      Authorization: `Bearer ${token("b")}`,
      "X-Tenant-Id": "11111111-1111-4111-8111-111111111111",
    },
  });
  expect(denied.status()).toBe(404);
  const noIdentity = await request.get(`/api/v1/assets/${receipt.assetId}`, {
    headers: { "X-Tenant-Id": "11111111-1111-4111-8111-111111111111" },
  });
  expect(noIdentity.status()).toBe(401);
  const invalid = await request.post("/api/v1/assets", {
    headers: { Authorization: auth.Authorization },
    multipart: {
      file: uploadFile(Buffer.from("%PDF-1.7 malformed synthetic")),
    },
  });
  expect(invalid.status()).toBe(202);
  const failed = await invalid.json();
  await expect
    .poll(
      async () => {
        const r = await request.get(`/api/v1/assets/${failed.assetId}`, {
          headers: { Authorization: auth.Authorization },
        });
        return (await r.json()).status;
      },
      { timeout: 30_000 },
    )
    .toBe("FAILED");
  const read = await request.get(`/api/v1/assets/${failed.assetId}`, {
    headers: { Authorization: auth.Authorization },
  });
  const detail = await read.json();
  expect(detail.errorCode).toBe("INVALID_DOCUMENT");
  contract("asset-api", "AssetDetail", detail);
  contract("asset-internal", "AssetDetail", detail);
});
test("unsafe uploads are rejected without metadata or processing events", async ({
  request,
}) => {
  const before = db("SELECT count(*) FROM asset");
  const auth = { Authorization: `Bearer ${token()}` };
  for (const [file, status] of [
    [uploadFile(Buffer.from("text"), "synthetic.txt", "text/plain"), 415],
    [uploadFile(Buffer.from("not a PDF")), 400],
    [uploadFile(Buffer.alloc(0)), 400],
    [uploadFile(Buffer.alloc(5 * 1024 * 1024 + 1)), 413],
  ] as const) {
    const r = await request.post("/api/v1/assets", {
      headers: auth,
      multipart: { file },
    });
    expect(r.status()).toBe(status);
  }
  expect(db("SELECT count(*) FROM asset")).toBe(before);
});
test("Kafka duplicate and conflicting out-of-order outcomes preserve terminal version", async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${token()}` };
  const accepted = await request.post("/api/v1/assets", {
    headers,
    multipart: { file: uploadFile() },
  });
  expect(accepted.status()).toBe(202);
  const receipt = await accepted.json();
  await expect
    .poll(
      async () => {
        const r = await request.get(`/api/v1/assets/${receipt.assetId}`, {
          headers,
        });
        return (await r.json()).status;
      },
      { timeout: 30_000 },
    )
    .toBe("COMPLETED");
  const uploaded = db(
    `SELECT payload FROM upload_outbox WHERE asset_id='${receipt.assetId}'`,
  );
  const outcome = db(
    `SELECT outcome FROM checkpoint WHERE asset_id='${receipt.assetId}'`,
    "worker_checkpoint",
  );
  const produce = (topic: string, payloads: string[]) =>
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "kafka",
        "/opt/kafka/bin/kafka-console-producer.sh",
        "--bootstrap-server",
        "localhost:19092",
        "--topic",
        topic,
        "--property",
        "parse.key=true",
        "--property",
        "key.separator=\t",
      ],
      {
        input: payloads.map((p) => `${receipt.assetId}\t${p}\n`).join(""),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  produce("asset.uploaded.v1", [uploaded, uploaded]);
  const conflict = {
    ...JSON.parse(outcome),
    eventId: randomUUID(),
    outcome: "FAILED",
    errorCode: "PROCESSING_ERROR",
  };
  produce("asset.processed.v1", [outcome, outcome, JSON.stringify(conflict)]);
  await expect
    .poll(() =>
      db(
        `SELECT count(*) FROM asset_finding WHERE event_id='${conflict.eventId}'`,
      ),
    )
    .toBe("1");
  expect(
    db(
      `SELECT count(*) FROM checkpoint WHERE asset_id='${receipt.assetId}'`,
      "worker_checkpoint",
    ),
  ).toBe("1");
  const read = await request.get(`/api/v1/assets/${receipt.assetId}`, {
    headers,
  });
  const detail = await read.json();
  expect(detail.status).toBe("COMPLETED");
  expect(detail.version).toBe(2);
});
test("worker process restart preserves durable terminal deduplication", async ({
  request,
}) => {
  test.setTimeout(90_000);
  const headers = { Authorization: `Bearer ${token()}` };
  const accepted = await request.post("/api/v1/assets", {
    headers,
    multipart: { file: uploadFile() },
  });
  const receipt = await accepted.json();
  await expect
    .poll(
      () => db(`SELECT status FROM asset WHERE asset_id='${receipt.assetId}'`),
      { timeout: 30_000 },
    )
    .toBe("COMPLETED");
  const state = JSON.parse(readFileSync(".local/apps.json", "utf8"));
  const outcome = db(
    `SELECT outcome FROM checkpoint WHERE asset_id='${receipt.assetId}'`,
    "worker_checkpoint",
  );
  process.kill(state.harness, "SIGUSR2");
  await expect
    .poll(
      () =>
        JSON.parse(readFileSync(".local/apps.json", "utf8"))[
          "processing-worker"
        ],
    )
    .not.toBe(state["processing-worker"]);
  const input = db(
    `SELECT payload FROM upload_outbox WHERE asset_id='${receipt.assetId}'`,
  );
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "kafka",
      "/opt/kafka/bin/kafka-console-producer.sh",
      "--bootstrap-server",
      "localhost:19092",
      "--topic",
      "asset.uploaded.v1",
    ],
    { input: input + "\n", stdio: ["pipe", "pipe", "pipe"] },
  );
  // A new upload proves the restarted worker is actively consuming and processing.
  const next = await request.post("/api/v1/assets", {
    headers,
    multipart: { file: uploadFile() },
  });
  const fresh = await next.json();
  await expect
    .poll(
      () => db(`SELECT status FROM asset WHERE asset_id='${fresh.assetId}'`),
      { timeout: 65_000 },
    )
    .toBe("COMPLETED");
  expect(
    db(
      `SELECT outcome FROM checkpoint WHERE asset_id='${receipt.assetId}'`,
      "worker_checkpoint",
    ),
  ).toBe(outcome);
  expect(
    db(
      `SELECT attempts FROM checkpoint WHERE asset_id='${receipt.assetId}'`,
      "worker_checkpoint",
    ),
  ).toBe("1");
  expect(
    db(`SELECT version FROM asset WHERE asset_id='${receipt.assetId}'`),
  ).toBe("2");
});
test("storage outage publishes nothing and same-key retry recovers after restart", async ({
  request,
}) => {
  const before = db("SELECT count(*) FROM asset");
  const beforeEvents = db("SELECT count(*) FROM upload_outbox");
  const headers = {
    Authorization: `Bearer ${token()}`,
    "Idempotency-Key": randomUUID(),
  };
  execFileSync("docker", ["compose", "stop", "storage"], { stdio: "pipe" });
  try {
    const failed = await request.post("/api/v1/assets", {
      headers,
      multipart: { file: uploadFile() },
    });
    expect(failed.status()).toBe(503);
    expect(db("SELECT count(*) FROM asset")).toBe(before);
    expect(db("SELECT count(*) FROM upload_outbox")).toBe(beforeEvents);
  } finally {
    execFileSync("docker", ["compose", "up", "-d", "--wait", "storage"], {
      stdio: "pipe",
    });
  }
  const retry = await request.post("/api/v1/assets", {
    headers,
    multipart: { file: uploadFile() },
  });
  expect(retry.status()).toBe(202);
  const receipt = await retry.json();
  await expect
    .poll(
      () => db(`SELECT status FROM asset WHERE asset_id='${receipt.assetId}'`),
      { timeout: 30_000 },
    )
    .toBe("COMPLETED");
});

test("container recreation preserves objects, Kafka log and accepted receipts", async ({
  request,
}) => {
  test.setTimeout(120_000);
  const headers = {
    Authorization: `Bearer ${token()}`,
    "Idempotency-Key": randomUUID(),
  };
  const accepted = await request.post("/api/v1/assets", {
    headers,
    multipart: { file: uploadFile() },
  });
  expect(accepted.status()).toBe(202);
  const receipt = await accepted.json();
  await expect
    .poll(
      () => db(`SELECT status FROM asset WHERE asset_id='${receipt.assetId}'`),
      { timeout: 30_000 },
    )
    .toBe("COMPLETED");
  const objectKey = db(
    `SELECT object_key FROM asset WHERE asset_id='${receipt.assetId}'`,
  );
  expect(objectKey).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  const offsets = () =>
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "kafka",
        "/opt/kafka/bin/kafka-get-offsets.sh",
        "--bootstrap-server",
        "localhost:19092",
        "--topic",
        "asset.uploaded.v1",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const before = offsets();
  execFileSync(
    "docker",
    ["compose", "up", "-d", "--wait", "--force-recreate", "kafka", "storage"],
    { stdio: "pipe" },
  );
  expect(offsets()).toBe(before);
  const content = execFileSync(
    "docker",
    [
      "compose",
      "run",
      "--rm",
      "--no-deps",
      "--entrypoint",
      "/bin/sh",
      "storage-init",
      "-ec",
      `rc alias set lab http://storage:9000 local_admin "$OBJECT_ADMIN_PASSWORD" >/dev/null; rc object show lab/synthetic-assets/${objectKey}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  expect(content).toEqual(pdf());
  const replay = await request.post("/api/v1/assets", {
    headers,
    multipart: { file: uploadFile() },
  });
  expect(replay.status()).toBe(202);
  expect(await replay.json()).toEqual(receipt);
  const fresh = await request.post("/api/v1/assets", {
    headers: { Authorization: headers.Authorization },
    multipart: { file: uploadFile() },
  });
  expect(fresh.status()).toBe(202);
  const next = await fresh.json();
  await expect
    .poll(
      () => db(`SELECT status FROM asset WHERE asset_id='${next.assetId}'`),
      { timeout: 65_000 },
    )
    .toBe("COMPLETED");
});
