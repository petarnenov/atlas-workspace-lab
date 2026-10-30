export type Status = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export interface Receipt {
  assetId: string;
  status: Status;
  correlationId: string;
}
export interface Detail {
  assetId: string;
  status: Status;
  version: number;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
}
const states: readonly string[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
];
export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(
      status === 401
        ? "Your synthetic token is missing or expired."
        : status === 404
          ? "Asset not found."
          : status === 413
            ? "Maximum file size is 5 MiB."
            : status === 415
              ? "Only PDF files are supported."
              : status === 400
                ? "The document or request is invalid."
                : "The service is temporarily unavailable.",
    );
  }
}
async function request(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(path, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
    signal: options.signal ?? AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}
export async function upload(
  file: File,
  token: string,
  key: string,
): Promise<Receipt> {
  const form = new FormData();
  form.set("file", file);
  const value = await request("/api/v1/assets", token, {
    method: "POST",
    body: form,
    headers: { "Idempotency-Key": key },
  });
  if (
    !isObject(value) ||
    typeof value.assetId !== "string" ||
    !states.includes(String(value.status)) ||
    typeof value.correlationId !== "string"
  )
    throw new Error("Invalid service response.");
  return value as unknown as Receipt;
}
export async function detail(
  id: string,
  token: string,
  signal?: AbortSignal,
): Promise<Detail> {
  const value = await request(
    `/api/v1/assets/${encodeURIComponent(id)}`,
    token,
    { signal },
  );
  if (
    !isObject(value) ||
    typeof value.assetId !== "string" ||
    !states.includes(String(value.status)) ||
    typeof value.version !== "number" ||
    value.version < 0 ||
    !Number.isInteger(value.version) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  )
    throw new Error("Invalid service response.");
  return value as unknown as Detail;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
export function validateFile(file: File): string | undefined {
  if (!file.size) return "Choose a non-empty synthetic PDF.";
  if (file.size > 5 * 1024 * 1024) return "Maximum file size is 5 MiB.";
  if (
    !file.name.toLowerCase().endsWith(".pdf") ||
    file.type !== "application/pdf"
  )
    return "Only PDF files are supported.";
  return undefined;
}
