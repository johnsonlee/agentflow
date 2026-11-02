import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    // RECORD_VIDEO=1 keeps a video of every test as playthrough evidence.
    video: process.env.RECORD_VIDEO ? "on" : "retain-on-failure",
    // SOFTWARE_GL=1 renders with SwiftShader like GitHub runners (pair with CPU_THROTTLE to reproduce CI speed).
    launchOptions: {
      args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...(process.env.SOFTWARE_GL ? ["--use-angle=swiftshader", "--disable-gpu"] : [])],
    },
  },
  projects: [
    { name: "desktop", testMatch: /desktop.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
    { name: "mobile", testMatch: /mobile.*\.spec\.ts/, use: { ...devices["Pixel 7"], viewport: { width: 915, height: 412 } } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
