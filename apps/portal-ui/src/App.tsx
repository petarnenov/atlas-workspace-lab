import { useEffect, useRef, useState, type FormEvent } from "react";
import { upload, validateFile, type Detail, type Receipt } from "./api";
import { poll } from "./poll";
import "./style.css";
export function App() {
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [current, setCurrent] = useState<Detail>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cycle, setCycle] = useState(0);
  const key = useRef("");
  const pollToken = useRef("");
  useEffect(() => {
    if (!receipt) return;
    const controller = new AbortController();
    void poll(
      receipt.assetId,
      pollToken.current,
      controller.signal,
      setCurrent,
    ).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Status unavailable."),
    );
    return () => controller.abort();
  }, [receipt, cycle]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!file || !token.trim()) {
      setError("Choose a synthetic PDF and enter a demo token.");
      return;
    }
    const invalid = validateFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const accepted = await upload(file, token.trim(), key.current);
      pollToken.current = token.trim();
      setCurrent(undefined);
      setReceipt(accepted);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Upload failed. Retry with the same file.",
      );
    } finally {
      setBusy(false);
    }
  }
  const status = current?.status ?? receipt?.status;
  return (
    <main>
      <header>
        <span className="eyebrow">ATLAS WORKSPACE LAB · LAB-101</span>
        <h1>Process a sample asset</h1>
        <p>Upload a synthetic PDF and follow its processing status.</p>
      </header>
      <aside role="note">
        Local demonstration. Use synthetic documents and synthetic identity
        tokens only. This is not production authentication.
      </aside>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label htmlFor="token">Synthetic demo token</label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={busy}
          required
          aria-describedby="token-help"
        />
        <small id="token-help">
          Paste the short-lived token issued by the local fixture script. Kept
          in memory only.
        </small>
        <label htmlFor="file">Sample PDF</label>
        <input
          id="file"
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            key.current = crypto.randomUUID();
            setError("");
          }}
          required
          aria-describedby="file-help"
        />
        <small id="file-help">PDF only · up to 5 MiB · synthetic content</small>
        <button disabled={busy} type="submit">
          {busy ? "Uploading…" : "Upload sample"}
        </button>
      </form>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {receipt && (
            <button
              onClick={() => {
                pollToken.current = token.trim();
                setError("");
                setCycle((c) => c + 1);
              }}
            >
              Retry status
            </button>
          )}
        </div>
      )}
      {receipt && (
        <section aria-live="polite" aria-label="Asset status">
          <h2>
            {status === "COMPLETED"
              ? "Processing complete"
              : status === "FAILED"
                ? "Processing failed"
                : "Processing your asset"}
          </h2>
          <p>
            Status: <strong>{status}</strong>
          </p>
          <p>
            Asset ID: <code>{receipt.assetId}</code>
          </p>
          {current?.errorCode && <p>Failure code: {current.errorCode}</p>}
        </section>
      )}
      <footer>
        Independent public engineering demonstration · React + Java
      </footer>
    </main>
  );
}
