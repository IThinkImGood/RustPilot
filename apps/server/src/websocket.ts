import http from "node:http";
import { WebSocketServer } from "ws";
import type { EventLogger } from "./logger.js";
import type { InstallManager } from "./installManager.js";
import type { ServerProcessManager } from "./serverProcessManager.js";
import type { Storage } from "./storage.js";
import type { RustAdapter } from "@rustpilot/rust-adapter";
import { computeSetupStatus } from "./setupStatus.js";

export function attachWebSocketServer(
  server: http.Server,
  logger: EventLogger,
  processManager: ServerProcessManager,
  installManager: InstallManager,
  storage: Storage,
  adapter: RustAdapter
): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const broadcast = (payload: unknown) => {
    const text = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(text);
    }
  };
  logger.on((event) => broadcast({ type: "console", event }));
  const timer = setInterval(() => {
    broadcast({
      type: "snapshot",
      status: {
        process: processManager.getStatus(),
        setup: computeSetupStatus(storage, adapter),
        installRunning: installManager.isRunning()
      }
    });
  }, 1000);
  wss.on("connection", (socket, request) => {
    const origin = request.headers.origin;
    if (origin && !origin.startsWith("http://127.0.0.1:") && !origin.startsWith("http://localhost:")) {
      socket.close(1008, "Only local origins are allowed.");
      return;
    }
    socket.send(JSON.stringify({ type: "history", events: logger.recent(500) }));
    socket.send(
      JSON.stringify({
        type: "snapshot",
        status: {
          process: processManager.getStatus(),
          setup: computeSetupStatus(storage, adapter),
          installRunning: installManager.isRunning()
        }
      })
    );
  });
  wss.on("error", (error) => {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") return;
    logger.emit("rustpilot", "system", "error", error instanceof Error ? error.message : String(error));
  });
  wss.on("close", () => clearInterval(timer));
}
