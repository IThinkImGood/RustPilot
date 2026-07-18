import { describe, expect, it } from "vitest";
import { getAppLayoutMode, shouldRedirectForSetup } from "./layoutMode";

describe("app layout mode", () => {
  it("uses setup-only layout during first-run", () => {
    expect(getAppLayoutMode({ loading: false, hasError: false, setupCompleted: false })).toBe("setup-only");
  });

  it("uses normal app layout when setup is complete", () => {
    expect(getAppLayoutMode({ loading: false, hasError: false, setupCompleted: true })).toBe("app");
  });

  it("redirects protected routes to setup during first-run", () => {
    expect(shouldRedirectForSetup("/dashboard", false)).toBe("/setup");
    expect(shouldRedirectForSetup("/console", false)).toBe("/setup");
    expect(shouldRedirectForSetup("/settings", false)).toBe("/setup");
  });

  it("redirects setup to dashboard after completion", () => {
    expect(shouldRedirectForSetup("/setup", true)).toBe("/dashboard");
  });
});
