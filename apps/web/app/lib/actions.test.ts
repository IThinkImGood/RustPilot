import { describe, expect, it } from "vitest";
import { getDashboardActionStates } from "./actions";

describe("dashboard action states", () => {
  it("only allows install when setup is incomplete", () => {
    expect(getDashboardActionStates({ setupCompleted: false }).install).toBe(true);
  });

  it("allows update and start only for installed stopped server", () => {
    const states = getDashboardActionStates({
      setupCompleted: true,
      installationState: "installed",
      processState: "stopped"
    });
    expect(states.update).toBe(true);
    expect(states.start).toBe(true);
  });

  it("allows stop while running and restart only while running", () => {
    const states = getDashboardActionStates({
      setupCompleted: true,
      installationState: "installed",
      processState: "running"
    });
    expect(states.stop).toBe(true);
    expect(states.restart).toBe(true);
    expect(states.start).toBe(false);
  });
});
