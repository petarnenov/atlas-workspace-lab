import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-k8s",
  workers: 1,
  timeout: 180_000,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${process.env.ATLAS_UI_PORT??5173}`, trace: "off", screenshot: "off" },
  webServer: {
    command: "node scripts/k8s/runtime.mjs forward",
    url: `http://127.0.0.1:${process.env.ATLAS_UI_PORT??5173}`,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
