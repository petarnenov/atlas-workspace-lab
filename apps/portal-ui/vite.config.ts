import { defineConfig } from "vite";
import { defineConfig as defineVitestConfig } from "vitest/config";

export default defineVitestConfig({
  server: { port: 5173 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
