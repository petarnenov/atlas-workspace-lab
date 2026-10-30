import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, detail, upload, validateFile } from "./api";
afterEach(() => vi.unstubAllGlobals());
const id = "11111111-1111-4111-8111-111111111111";
const file = new File(["%PDF-1.7 synthetic"], "sample.pdf", {
  type: "application/pdf",
});
describe("typed asset API", () => {
  it("posts a PDF with bearer and stable idempotency key", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          assetId: id,
          status: "PENDING",
          correlationId: id,
        }),
      });
    vi.stubGlobal("fetch", fetch);
    expect((await upload(file, "fixture-token", "same-key")).assetId).toBe(id);
    const [path, request] = fetch.mock.calls[0]!;
    expect(path).toBe("/api/v1/assets");
    expect(request.headers).toEqual({
      Authorization: "Bearer fixture-token",
      "Idempotency-Key": "same-key",
    });
    expect(request.body.get("file")).toEqual(file);
  });
  it("validates read responses and encodes identifiers", async () => {
    const value = {
      assetId: id,
      status: "COMPLETED",
      version: 2,
      createdAt: "2026-10-30T00:00:00Z",
      updatedAt: "2026-10-30T00:00:01Z",
    };
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => value });
    vi.stubGlobal("fetch", fetch);
    expect(await detail(id, "token")).toEqual(value);
    expect(fetch.mock.calls[0]![0]).toContain(id);
    for (const invalid of [
      null,
      {},
      { ...value, status: "SECRET" },
      { ...value, version: -1 },
      { ...value, version: 0.5 },
      { ...value, createdAt: null },
      { ...value, updatedAt: null },
    ]) {
      fetch.mockResolvedValueOnce({ ok: true, json: async () => invalid });
      await expect(detail(id, "token")).rejects.toThrow(
        "Invalid service response",
      );
    }
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(upload(file, "token", "key")).rejects.toThrow(
      "Invalid service response",
    );
  });
  it.each([400, 401, 403, 404, 413, 415, 500, 503])(
    "reports sanitized HTTP %s",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
      await expect(detail(id, "token")).rejects.toMatchObject({ status });
      expect(new ApiError(status).message).not.toContain("token-value");
    },
  );
  it("rejects unsupported empty and oversized files before upload", () => {
    expect(validateFile(file)).toBeUndefined();
    expect(
      validateFile(new File([], "a.pdf", { type: "application/pdf" })),
    ).toContain("non-empty");
    expect(
      validateFile(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.pdf", {
          type: "application/pdf",
        }),
      ),
    ).toContain("5 MiB");
    expect(
      validateFile(new File(["x"], "a.txt", { type: "text/plain" })),
    ).toContain("Only PDF");
  });
});
