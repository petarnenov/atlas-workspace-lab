import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-helm",
  workers: 1,
  timeout: 180_000,
  reporter: "list",
  use: { trace: "off", screenshot: "off" },
  webServer: [
    {
      command: "ENV=dev node scripts/helm/runtime.mjs forward",
      url: "http://127.0.0.1:5173",
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: "ENV=prod node scripts/helm/runtime.mjs forward",
      url: "http://127.0.0.1:5174",
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
