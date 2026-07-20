import { describe, expect, it } from "vitest";
import { buildWebSocketUrl } from "./ws";

describe("buildWebSocketUrl", () => {
  it("uses the current backend host and ws protocol", () => {
    expect(buildWebSocketUrl({ protocol: "http:", host: "127.0.0.1:40815" })).toBe(
      "ws://127.0.0.1:40815/ws"
    );
  });

  it("uses wss for https", () => {
    expect(buildWebSocketUrl({ protocol: "https:", host: "localhost:40815" })).toBe(
      "wss://localhost:40815/ws"
    );
  });
});
