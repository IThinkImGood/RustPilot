import fs from "node:fs";
import path from "node:path";
import { redactSecret, type ConsoleEvent, type ConsoleLevel, type ConsoleSource, type ConsoleStream } from "@rustpilot/shared";

export type ConsoleListener = (event: ConsoleEvent) => void;

const prefixBySource: Record<ConsoleSource, string> = {
  rustpilot: "RustPilot",
  steamcmd: "SteamCMD",
  "rust-server": "Server"
};

export class EventLogger {
  private listeners = new Set<ConsoleListener>();
  private history: ConsoleEvent[] = [];
  private nextId = 1;
  private logFile: string | null = null;

  constructor(private readonly historyLimit = 1500) {}

  configureDiskLogging(logsDir: string): void {
    fs.mkdirSync(logsDir, { recursive: true });
    this.logFile = path.join(logsDir, "rustpilot.log");
  }

  on(listener: ConsoleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recent(limit = 300): ConsoleEvent[] {
    return this.history.slice(-limit);
  }

  emit(source: ConsoleSource, stream: ConsoleStream, level: ConsoleLevel, message: string): ConsoleEvent {
    const event: ConsoleEvent = {
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      source,
      stream,
      level,
      message: redactSecret(message)
    };
    this.history.push(event);
    if (this.history.length > this.historyLimit) this.history.shift();
    const prefix = `[${prefixBySource[source]}]`;
    const line = `${new Date(event.timestamp).toLocaleString()} ${prefix} ${event.message}`;
    if (stream === "stderr" || level === "error") console.error(line);
    else console.log(line);
    if (this.logFile && (source === "rustpilot" || level === "error" || stream === "system")) {
      this.appendBounded(line);
    }
    for (const listener of this.listeners) listener(event);
    return event;
  }

  private appendBounded(line: string): void {
    if (!this.logFile) return;
    fs.appendFileSync(this.logFile, `${line}\n`);
    const stat = fs.statSync(this.logFile);
    const maxBytes = 5 * 1024 * 1024;
    if (stat.size > maxBytes) {
      const data = fs.readFileSync(this.logFile, "utf8").slice(-Math.floor(maxBytes / 2));
      fs.writeFileSync(this.logFile, data);
    }
  }
}
