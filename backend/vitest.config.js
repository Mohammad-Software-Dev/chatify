import { defineConfig } from "vitest/config";

if (!process.env.TEST_MONGO_URI && process.env.FORCE_DB_TESTS !== "true") {
  process.env.SKIP_DB_TESTS = "true";
}

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
  },
});
