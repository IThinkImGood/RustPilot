import { describe, expect, it } from "vitest";
import { getSetupRedirectTarget } from "./routes";

describe("route setup guard decisions", () => {
  it("redirects a new installation root to setup", () => {
    expect(getSetupRedirectTarget("/", false)).toBe("/setup");
  });

  it("blocks dashboard when setup is incomplete", () => {
    expect(getSetupRedirectTarget("/dashboard", false)).toBe("/setup");
  });

  it("allows dashboard when setup is complete", () => {
    expect(getSetupRedirectTarget("/dashboard", true)).toBeNull();
  });

  it("blocks cfg editor when setup is incomplete", () => {
    expect(getSetupRedirectTarget("/cfg-editor", false)).toBe("/setup");
  });
});
