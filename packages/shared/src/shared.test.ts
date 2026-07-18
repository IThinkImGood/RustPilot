import { describe, expect, it } from "vitest";
import { defaultServerSettings, serverSettingsSchema } from "./schemas.js";
import { redactArgs, redactSecret } from "./redact.js";
import { canTransitionInstallation, canTransitionProcess } from "./state.js";
import { resolveInside } from "./paths.js";

describe("serverSettingsSchema", () => {
  it("accepts valid defaults", () => {
    expect(serverSettingsSchema.safeParse(defaultServerSettings).success).toBe(true);
  });

  it("accepts an optional install directory", () => {
    const result = serverSettingsSchema.safeParse({
      ...defaultServerSettings,
      installDirectory: "D:\\RustServers\\MijnServer"
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(serverSettingsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects duplicate ports", () => {
    const result = serverSettingsSchema.safeParse({ ...defaultServerSettings, queryPort: 28015 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ports", () => {
    expect(serverSettingsSchema.safeParse({ ...defaultServerSettings, gamePort: 70000 }).success).toBe(
      false
    );
  });

  it("rejects unsafe identities", () => {
    for (const identity of ["../x", "a/b", "a\\b", "bad name", ".."]) {
      expect(serverSettingsSchema.safeParse({ ...defaultServerSettings, identity }).success).toBe(false);
    }
  });
});

describe("paths", () => {
  it("blocks traversal", () => {
    expect(() => resolveInside("data", "..", "outside")).toThrow();
  });
});

describe("redaction", () => {
  it("redacts rcon passwords", () => {
    expect(redactSecret('+rcon.password "secret"')).toContain("[REDACTED]");
    expect(redactArgs(["+rcon.password", "secret"])).toEqual(["+rcon.password", "[REDACTED]"]);
  });
});

describe("state transitions", () => {
  it("allows valid transitions and blocks invalid transitions", () => {
    expect(canTransitionInstallation("ready_for_install", "downloading_steamcmd")).toBe(true);
    expect(canTransitionInstallation("ready_for_install", "installed")).toBe(false);
    expect(canTransitionProcess("stopped", "starting")).toBe(true);
    expect(canTransitionProcess("stopped", "running")).toBe(false);
  });
});
