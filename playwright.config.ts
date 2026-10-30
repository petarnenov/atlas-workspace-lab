import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", trace: "off", screenshot: "off" },
  webServer: [
    {
      command: "node scripts/local/apps.mjs",
      url: "http://127.0.0.1:8080/api/v1/assets/00000000-0000-4000-8000-000000000000",
      timeout: 90_000,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @atlas/portal-ui dev --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
