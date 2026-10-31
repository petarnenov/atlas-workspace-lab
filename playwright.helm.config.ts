import { defineConfig } from "@playwright/test";
const devPort=Number(process.env.ATLAS_UI_PORT??5173);
const devOnly=process.env.ATLAS_HELM_TEST_ENV==='dev';
if(process.env.ATLAS_HELM_TEST_ENV&&!devOnly)throw Error('Local Helm selection must be dev');
export default defineConfig({
  testDir: "./e2e-helm",
  workers: 1,
  timeout: 180_000,
  reporter: "list",
  use: { trace: "off", screenshot: "off" },
  webServer: [
    {
      command: "ENV=dev node scripts/helm/runtime.mjs forward",
      url: `http://127.0.0.1:${devPort}`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    ...(!devOnly?[{
      command: "ENV=prod node scripts/helm/runtime.mjs forward",
      url: "http://127.0.0.1:5174",
      timeout: 30_000,
      reuseExistingServer: false,
    }]:[]),
  ],
});
