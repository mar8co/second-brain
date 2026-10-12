// Test end-to-end in modalità locale (IndexedDB), con pagine e Gemini finti.
import { defineConfig } from "@playwright/test";

const FIX = 4599;
const APP = 5199;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${APP}`,
    // Viewport e comportamento touch da iPhone (motore Chromium).
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "it-IT",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: [
    { command: `node tests/e2e/fixtures.mjs`, port: FIX, env: { FIXTURE_PORT: String(FIX) }, reuseExistingServer: false },
    {
      command: `npx vite --port ${APP} --strictPort`,
      port: APP,
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_ANON_KEY: "",
        EXTRACT_ALLOW_PRIVATE: "1",
        GEMINI_API_KEY: "fake-key",
        GEMINI_API_BASE: `http://127.0.0.1:${FIX}`,
      },
    },
  ],
});
