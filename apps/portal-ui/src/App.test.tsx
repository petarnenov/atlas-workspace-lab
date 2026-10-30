import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "./App";
import { upload } from "./api";
import { poll } from "./poll";
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  upload: vi.fn(),
}));
vi.mock("./poll", () => ({ poll: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const receipt = {
  assetId: "11111111-1111-4111-8111-111111111111",
  status: "PENDING" as const,
  correlationId: "22222222-2222-4222-8222-222222222222",
};
function fill() {
  fireEvent.change(screen.getByLabelText("Synthetic demo token"), {
    target: { value: "fixture" },
  });
  fireEvent.change(screen.getByLabelText("Sample PDF"), {
    target: {
      files: [
        new File(["%PDF-1.7 synthetic"], "a.pdf", { type: "application/pdf" }),
      ],
    },
  });
}
it("uploads a synthetic PDF and presents completed status accessibly", async () => {
  vi.mocked(upload).mockResolvedValue(receipt);
  vi.mocked(poll).mockImplementation(async (_id, _token, _signal, update) =>
    update({
      assetId: receipt.assetId,
      status: "COMPLETED",
      version: 2,
      createdAt: "now",
      updatedAt: "now",
    }),
  );
  render(<App />);
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "Upload sample" }).closest("form")!,
  );
  await screen.findByText("Processing complete");
  expect(
    screen.getByRole("region", { name: "Asset status" }).textContent,
  ).toContain(receipt.assetId);
});
it("preserves the idempotency key on failed upload retry", async () => {
  vi.mocked(upload)
    .mockRejectedValueOnce(new Error("Temporary upload failure"))
    .mockResolvedValueOnce(receipt);
  vi.mocked(poll).mockResolvedValue(undefined);
  render(<App />);
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "Upload sample" }).closest("form")!,
  );
  await screen.findByRole("alert");
  fireEvent.submit(
    screen.getByRole("button", { name: "Upload sample" }).closest("form")!,
  );
  await screen.findByRole("region", { name: "Asset status" });
  expect(vi.mocked(upload).mock.calls[0]![2]).toBe(
    vi.mocked(upload).mock.calls[1]![2],
  );
});
it("shows failed processing and allows status recovery with a refreshed token", async () => {
  vi.mocked(upload).mockResolvedValue(receipt);
  vi.mocked(poll)
    .mockRejectedValueOnce(new Error("Status unavailable"))
    .mockImplementationOnce(async (_id, _token, _signal, update) =>
      update({
        assetId: receipt.assetId,
        status: "FAILED",
        version: 2,
        createdAt: "now",
        updatedAt: "now",
        errorCode: "INVALID_DOCUMENT",
      }),
    );
  render(<App />);
  fill();
  fireEvent.submit(
    screen.getByRole("button", { name: "Upload sample" }).closest("form")!,
  );
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry status" }));
  await screen.findByText("Processing failed");
  expect(screen.getByText("Failure code: INVALID_DOCUMENT")).toBeTruthy();
});
it("rejects invalid input without a network call", async () => {
  render(<App />);
  fireEvent.submit(
    screen.getByRole("button", { name: "Upload sample" }).closest("form")!,
  );
  expect(screen.getByRole("alert").textContent).toContain("Choose");
  fill();
  fireEvent.change(screen.getByLabelText("Sample PDF"), {
    target: { files: [new File(["bad"], "a.txt", { type: "text/plain" })] },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Upload sample" }).closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Only PDF"),
  );
  expect(upload).not.toHaveBeenCalled();
});
