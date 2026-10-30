import { ApiError, detail, type Detail } from "./api";
export async function poll(
  id: string,
  token: string,
  signal: AbortSignal,
  update: (value: Detail) => void,
): Promise<void> {
  let failures = 0;
  let version = -1;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (signal.aborted) return;
    try {
      const value = await detail(
        id,
        token,
        AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      );
      if (signal.aborted) return;
      failures = 0;
      if (value.version >= version) {
        version = value.version;
        update(value);
        if (value.status === "COMPLETED" || value.status === "FAILED") return;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (
        error instanceof ApiError &&
        [400, 401, 403, 404].includes(error.status)
      )
        throw error;
      if (++failures >= 3)
        throw new Error(
          "Status is temporarily unavailable. Retry status to continue.",
        );
    }
    await new Promise<void>((resolve) => {
      const cancel = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", cancel);
        resolve();
      }, 2000);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }
  throw new Error("Polling limit reached. Retry status to continue.");
}
