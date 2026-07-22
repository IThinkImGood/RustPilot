import { describe, expect, it } from "vitest";
import { buildUsersCfgLine, isSteamId64 } from "./usersCfg";

describe("users.cfg helpers", () => {
  it("validates SteamID64 values", () => {
    expect(isSteamId64("76561198000000000")).toBe(true);
    expect(isSteamId64("7656119800000000")).toBe(false);
    expect(isSteamId64("not-a-steamid")).toBe(false);
  });

  it("builds owner and moderator cfg lines", () => {
    expect(buildUsersCfgLine("ownerid", "76561198000000000", "Alice", "Main owner")).toBe(
      'ownerid 76561198000000000 "Alice" "Main owner"'
    );
    expect(buildUsersCfgLine("moderatorid", "76561198000000001", "", "")).toBe(
      'moderatorid 76561198000000001 "Moderator" "Moderator"'
    );
  });

  it("escapes quotes and newlines in labels", () => {
    expect(buildUsersCfgLine("ownerid", "76561198000000000", 'Ali"ce', "Line\r\nBreak")).toBe(
      'ownerid 76561198000000000 "Ali\\"ce" "Line  Break"'
    );
  });
});
