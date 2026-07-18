import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.resolve("apps/web/app/globals.css"), "utf8");

describe("dashboard layout CSS", () => {
  it("uses responsive dashboard grid without forced four columns", () => {
    expect(css).toContain(".dashboard-grid");
    expect(css).toContain("repeat(auto-fit");
    expect(css).not.toContain("repeat(4");
  });

  it("prevents long path values from widening the page", () => {
    expect(css).toContain(".path-value");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).toContain("min-width: 0");
  });
});
