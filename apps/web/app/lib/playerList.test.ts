import { describe, expect, it } from "vitest";
import { parseRconPlayers } from "./playerList";

describe("parseRconPlayers", () => {
  it("parses Rust playerlist JSON arrays", () => {
    const players = parseRconPlayers(
      JSON.stringify([
        { SteamID: "76561198000000001", DisplayName: "Alice", Ping: 42, ConnectedSeconds: 120 },
        { SteamID: "76561198000000002", DisplayName: "Bob", Ping: "55" }
      ])
    );
    expect(players).toEqual([
      { id: "76561198000000001", name: "Alice", target: "76561198000000001", ping: 42, connectedSeconds: 120 },
      { id: "76561198000000002", name: "Bob", target: "76561198000000002", ping: 55, connectedSeconds: null }
    ]);
  });

  it("parses JSON envelopes with a players array", () => {
    const players = parseRconPlayers(JSON.stringify({ players: [{ steamid: "76561198000000003", name: "Charlie" }] }));
    expect(players).toEqual([{ id: "76561198000000003", name: "Charlie", target: "76561198000000003", ping: null, connectedSeconds: null }]);
  });

  it("parses alternate Rust player JSON field names", () => {
    const players = parseRconPlayers(
      JSON.stringify({
        Players: [
          { SteamIDString: "76561198000000004", Username: "Delta", Latency: "61", Connected: "480" },
          { UserId: "76561198000000005", Displayname: "Echo" }
        ]
      })
    );
    expect(players).toEqual([
      { id: "76561198000000004", name: "Delta", target: "76561198000000004", ping: 61, connectedSeconds: 480 },
      { id: "76561198000000005", name: "Echo", target: "76561198000000005", ping: null, connectedSeconds: null }
    ]);
  });

  it("parses text lines with quoted names and ping values", () => {
    const players = parseRconPlayers('1 "Alice The Builder" 76561198000000001 43ms\n2 Bob 76561198000000002 ping=55');
    expect(players).toEqual([
      { id: "76561198000000001", name: "Alice The Builder", target: "76561198000000001", ping: 43 },
      { id: "76561198000000002", name: "Bob", target: "76561198000000002", ping: 55 }
    ]);
  });

  it("parses pipe and key-value text player rows", () => {
    const players = parseRconPlayers(
      "steamid=76561198000000006 name=Foxtrot ping=44\n7 | 76561198000000007 | Golf Squad | connected=120"
    );
    expect(players).toEqual([
      { id: "76561198000000006", name: "Foxtrot", target: "76561198000000006", ping: 44 },
      { id: "76561198000000007", name: "Golf Squad", target: "76561198000000007", ping: null }
    ]);
  });

  it("deduplicates repeated players by id", () => {
    const players = parseRconPlayers("Alice 76561198000000001\nAlice again 76561198000000001");
    expect(players).toHaveLength(1);
  });
});
