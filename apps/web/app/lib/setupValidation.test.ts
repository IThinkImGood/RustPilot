import { describe, expect, it } from "vitest";
import { defaultServerSettings } from "@rustpilot/shared";
import { validateSetupForm } from "./setupValidation";

describe("setup live validation", () => {
  it("validates identity", () => {
    expect(validateSetupForm({ ...defaultServerSettings, identity: "default_1" }).identity).toEqual({
      kind: "ok",
      message: "Valid"
    });
    expect(validateSetupForm({ ...defaultServerSettings, identity: "bad name" }).identity?.message).toBe("Invalid characters");
    expect(validateSetupForm({ ...defaultServerSettings, identity: ".." }).identity?.message).toBe("'..' is not allowed");
  });

  it("detects port conflicts", () => {
    const validation = validateSetupForm({ ...defaultServerSettings, gamePort: "28015", rconPort: "28015" });
    expect(validation.gamePort?.message).toBe("This port is already used.");
    expect(validation.rconPort?.message).toBe("Conflicts with Game port.");
  });

  it("validates URLs", () => {
    expect(validateSetupForm({ ...defaultServerSettings, serverUrl: "https://example.com" }).serverUrl?.kind).toBe("ok");
    expect(validateSetupForm({ ...defaultServerSettings, serverUrl: "example" }).serverUrl?.message).toBe("Invalid URL.");
  });

  it("validates seed", () => {
    expect(validateSetupForm({ ...defaultServerSettings, seed: "abc" }).seed?.message).toBe("Must be an integer.");
    expect(validateSetupForm({ ...defaultServerSettings, seed: "42" }).seed?.kind).toBe("ok");
  });

  it("validates world size", () => {
    expect(validateSetupForm({ ...defaultServerSettings, worldSize: "999" }).worldSize?.message).toBe("Invalid size.");
    expect(validateSetupForm({ ...defaultServerSettings, worldSize: "4000" }).worldSize?.kind).toBe("ok");
  });
});
