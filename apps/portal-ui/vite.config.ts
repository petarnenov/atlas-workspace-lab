import { defineConfig } from "vitest/config";
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8080" },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx"],
      thresholds: { lines: 75, functions: 75, branches: 75, statements: 75 },
      reporter: ["text", "json-summary", "html"],
    },
  },
});
