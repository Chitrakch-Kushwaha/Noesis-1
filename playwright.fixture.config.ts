// Developer-fixture journeys (Phase 5): a development server with NOESIS_TUTOR_FIXTURES=1, so the
// live-tutor interface, voice pipeline and failure paths can be exercised without any key or vendor.
// Fixture replies and the test tone are labelled in the UI and are never presented as a live tutor.
//   npx playwright test -c playwright.fixture.config.ts
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.FIXTURE_PORT ?? 3300);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /tutor-fixture\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    baseURL: `http://localhost:${PORT}`,
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    env: { NOESIS_TUTOR_FIXTURES: "1" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
