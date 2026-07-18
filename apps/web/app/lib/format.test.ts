import { describe, expect, it } from "vitest";
import { formatLocalDateTime, formatUptime, shortenPath } from "./format";

describe("formatUptime", () => {
  it("formats minutes, hours, and days", () => {
    expect(formatUptime(540)).toBe("9 min");
    expect(formatUptime(8040)).toBe("2h 14m");
    expect(formatUptime(97200)).toBe("1d 3h");
  });
});

describe("formatLocalDateTime", () => {
  it("formats readable local timestamps", () => {
    expect(formatLocalDateTime("2026-07-16T18:43:52.000Z")).toContain("2026");
  });
});

describe("shortenPath", () => {
  it("shortens long paths safely", () => {
    expect(shortenPath("C:\\very\\long\\path\\to\\servers\\default\\server\\RustDedicated.exe")).toContain("...");
  });
});
