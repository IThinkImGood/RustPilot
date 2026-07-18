import { describe, expect, it } from "vitest";
import { nextTooltipVisible } from "./tooltipState";

describe("tooltip interaction state", () => {
  it("shows on hover", () => {
    expect(nextTooltipVisible(false, "hover-start")).toBe(true);
  });

  it("shows via keyboard focus", () => {
    expect(nextTooltipVisible(false, "focus")).toBe(true);
  });

  it("hides when hover or focus ends", () => {
    expect(nextTooltipVisible(true, "hover-end")).toBe(false);
    expect(nextTooltipVisible(true, "blur")).toBe(false);
  });
});
