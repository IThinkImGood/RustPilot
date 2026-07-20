import { describe, expect, it } from "vitest";
import { loadAppConfig } from "./config.js";

describe("loadAppConfig", () => {
  it("defaults the backend to 40815 and development frontend to 3001", () => {
    const oldEnv = { ...process.env };
    delete process.env.RUSTPILOT_HOST;
    delete process.env.RUSTPILOT_PORT;
    delete process.env.RUSTPILOT_WEB_DEV_HOST;
    delete process.env.RUSTPILOT_WEB_DEV_PORT;
    delete process.env.RUSTPILOT_WEB_DEV_URL;
    try {
      const config = loadAppConfig();
      expect(config.host).toBe("127.0.0.1");
      expect(config.port).toBe(40815);
      expect(config.webDevHost).toBe("127.0.0.1");
      expect(config.webDevPort).toBe(3001);
      expect(config.webDevUrl).toBe("http://127.0.0.1:3001");
    } finally {
      process.env = oldEnv;
    }
  });

  it("derives webDevUrl from explicit frontend host and port", () => {
    const oldEnv = { ...process.env };
    delete process.env.RUSTPILOT_WEB_DEV_URL;
    process.env.RUSTPILOT_WEB_DEV_HOST = "127.0.0.1";
    process.env.RUSTPILOT_WEB_DEV_PORT = "3456";
    try {
      expect(loadAppConfig().webDevUrl).toBe("http://127.0.0.1:3456");
    } finally {
      process.env = oldEnv;
    }
  });
});
