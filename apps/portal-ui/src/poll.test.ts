import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { poll } from "./poll";
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const id = "11111111-1111-4111-8111-111111111111";
const value = (status = "PROCESSING", version = 1) => ({
  assetId: id,
  status,
  version,
  createdAt: "2026-10-30T00:00:00Z",
  updatedAt: "2026-10-30T00:00:01Z",
});
const response = (status = "PROCESSING", version = 1) => ({
  ok: true,
  json: async () => value(status, version),
});
it("recovers temporary failure and stops on completed", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(response("COMPLETED", 2));
  vi.stubGlobal("fetch", fetch);
  const update = vi.fn();
  const promise = poll(id, "token", new AbortController().signal, update);
  await vi.advanceTimersByTimeAsync(4000);
  await promise;
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(update.mock.calls.at(-1)?.[0].status).toBe("COMPLETED");
});
it("ignores regressing versions", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(response("PROCESSING", 2))
      .mockResolvedValueOnce(response("COMPLETED", 0))
      .mockResolvedValueOnce(response("FAILED", 3)),
  );
  const update = vi.fn();
  const promise = poll(id, "token", new AbortController().signal, update);
  await vi.advanceTimersByTimeAsync(4000);
  await promise;
  expect(update.mock.calls.map((c) => c[0].version)).toEqual([2, 3]);
});
it("stops after three consecutive failures", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("network"));
  vi.stubGlobal("fetch", fetch);
  const promise = expect(
    poll(id, "token", new AbortController().signal, vi.fn()),
  ).rejects.toThrow("temporarily unavailable");
  await vi.advanceTimersByTimeAsync(4000);
  await promise;
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("does not retry authorization errors", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
  vi.stubGlobal("fetch", fetch);
  await expect(
    poll(id, "token", new AbortController().signal, vi.fn()),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("bounds polling and supports cancellation between attempts", async () => {
  const fetch = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", fetch);
  const timeout = expect(
    poll(id, "token", new AbortController().signal, vi.fn()),
  ).rejects.toThrow("Polling limit");
  await vi.advanceTimersByTimeAsync(120000);
  await timeout;
  expect(fetch).toHaveBeenCalledTimes(60);
  const controller = new AbortController();
  const promise = poll(id, "token", controller.signal, vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await promise;
  const count = fetch.mock.calls.length;
  await poll(id, "token", controller.signal, vi.fn());
  expect(fetch).toHaveBeenCalledTimes(count);
});
