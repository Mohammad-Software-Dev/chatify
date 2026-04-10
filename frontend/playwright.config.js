import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --dir ../backend e2e:server",
      url: "http://127.0.0.1:3010/health",
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command:
        "VITE_API_BASE_URL=http://127.0.0.1:3010/api VITE_SOCKET_URL=http://127.0.0.1:3010 pnpm dev --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174",
      timeout: 120000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
