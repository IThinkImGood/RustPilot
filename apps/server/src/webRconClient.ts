import WebSocket from "ws";
import type { RconCommandResponse, RconStatus, ServerSettings } from "@rustpilot/shared";
import type { EventLogger } from "./logger.js";

interface WebRconRequest {
  Identifier: number;
  Message: string;
  Name: string;
}

interface WebRconMessage {
  Identifier?: number;
  Message?: string;
  Name?: string;
  Type?: string;
  Stacktrace?: string;
}

interface PendingCommand {
  command: string;
  startedAt: number;
  resolve: (response: RconCommandResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const CONNECT_TIMEOUT_MS = 5000;
const COMMAND_TIMEOUT_MS = 8000;

function safeParseMessage(data: WebSocket.RawData): WebRconMessage | null {
  const text = data.toString("utf8");
  try {
    const parsed = JSON.parse(text) as WebRconMessage;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return { Message: text };
  }
}

function endpointFor(settings: ServerSettings): string {
  return `ws://127.0.0.1:${settings.rconPort}/${encodeURIComponent(settings.rconPassword)}`;
}

function redactedEndpoint(settings: ServerSettings): string {
  return `ws://127.0.0.1:${settings.rconPort}/[redacted]`;
}

export class WebRconClient {
  private socket: WebSocket | null = null;
  private state: RconStatus["state"] = "disconnected";
  private endpoint: string | null = null;
  private connectedAt: string | null = null;
  private lastError: string | null = null;
  private nextIdentifier = 1;
  private pending = new Map<number, PendingCommand>();

  constructor(private readonly logger: EventLogger) {}

  getStatus(): RconStatus {
    return {
      state: this.state,
      endpoint: this.endpoint,
      connectedAt: this.connectedAt,
      lastError: this.lastError,
      pendingCommands: this.pending.size
    };
  }

  async connect(settings: ServerSettings): Promise<void> {
    const endpoint = endpointFor(settings);
    const publicEndpoint = redactedEndpoint(settings);
    if (this.socket?.readyState === WebSocket.OPEN && this.endpoint === publicEndpoint) return;
    this.disconnect();
    this.endpoint = publicEndpoint;
    this.state = "connecting";
    this.lastError = null;
    this.logger.emit("rustpilot", "system", "info", `Connecting WebRCON: ${publicEndpoint}`);

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(endpoint);
      this.socket = socket;
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("WebRCON connection timed out."));
      }, CONNECT_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        socket.off("open", onOpen);
        socket.off("error", onError);
      };
      const onOpen = () => {
        cleanup();
        this.state = "connected";
        this.connectedAt = new Date().toISOString();
        this.logger.emit("rustpilot", "system", "info", "WebRCON connected.");
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        this.state = "error";
        this.lastError = error.message;
        reject(error);
      };
      socket.once("open", onOpen);
      socket.once("error", onError);
      socket.on("message", (data) => this.handleMessage(data));
      socket.on("close", () => this.handleClose());
    });
  }

  disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    this.rejectPending(new Error("WebRCON disconnected."));
    this.state = "disconnected";
    this.connectedAt = null;
  }

  async sendCommand(settings: ServerSettings, command: string): Promise<RconCommandResponse> {
    if (this.socket?.readyState !== WebSocket.OPEN) await this.connect(settings);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("WebRCON is not connected.");
    const identifier = this.nextIdentifier++;
    const request: WebRconRequest = {
      Identifier: identifier,
      Message: command,
      Name: "RustPilot"
    };
    this.logger.emit("rust-server", "input", "info", command);
    return await new Promise<RconCommandResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(identifier);
        reject(new Error(`WebRCON command timed out: ${command}`));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(identifier, {
        command,
        startedAt: Date.now(),
        resolve,
        reject,
        timer
      });
      this.socket?.send(JSON.stringify(request), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(identifier);
        reject(error);
      });
    });
  }

  private handleMessage(data: WebSocket.RawData): void {
    const message = safeParseMessage(data);
    if (!message) return;
    const identifier = typeof message.Identifier === "number" ? message.Identifier : null;
    if (identifier !== null) {
      const pending = this.pending.get(identifier);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(identifier);
        const response: RconCommandResponse = {
          command: pending.command,
          message: message.Message ?? "",
          identifier,
          type: message.Type ?? null,
          durationMs: Date.now() - pending.startedAt
        };
        if (response.message) this.logger.emit("rust-server", "stdout", "info", response.message);
        pending.resolve(response);
        return;
      }
    }
    if (message.Message) this.logger.emit("rust-server", "stdout", "info", message.Message);
  }

  private handleClose(): void {
    if (this.state === "connected") this.logger.emit("rustpilot", "system", "warn", "WebRCON disconnected.");
    this.state = "disconnected";
    this.connectedAt = null;
    this.socket = null;
    this.rejectPending(new Error("WebRCON disconnected."));
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
