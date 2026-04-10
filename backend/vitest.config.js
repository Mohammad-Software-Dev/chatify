import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 30000,
  },
});
