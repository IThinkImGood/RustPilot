import fs from "node:fs";
import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { type ProcessState, type ServerRuntimeStatus, type ServerSettings } from "@rustpilot/shared";
import { RustAdapter } from "@rustpilot/rust-adapter";
import type { EventLogger } from "./logger.js";
import type { ProcessRunner } from "./processRunner.js";
import type { Storage } from "./storage.js";

export class ServerProcessManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private state: ProcessState = "stopped";
  private startedAt: Date | null = null;
  private requestedStop = false;
  private restartInProgress = false;

  constructor(
    private readonly adapter: RustAdapter,
    private readonly storage: Storage,
    private readonly logger: EventLogger,
    private readonly runner: ProcessRunner
  ) {}

  getStatus(): ServerRuntimeStatus {
    const meta = this.storage.getRuntimeMeta();
    return {
      processState: this.state,
      pid: this.child?.pid ?? null,
      startedAt: this.startedAt?.toISOString() ?? meta.lastStart,
      stoppedAt: meta.lastStop,
      uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000) : 0,
      lastExitCode: meta.lastExitCode,
      lastSignal: meta.lastSignal,
      lastCrashAt: meta.lastCrashAt
    };
  }

  async start(settings: ServerSettings): Promise<void> {
    if (this.child) throw new Error("The Rust server is already running or starting.");
    const paths = this.adapter.getPaths(settings);
    const validation = this.adapter.validateInstallation(settings);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    if (!fs.existsSync(paths.rustDedicatedExe)) throw new Error("RustDedicated.exe does not exist.");
    const args = this.adapter.generateLaunchArguments(settings);
    this.logger.emit(
      "rustpilot",
      "system",
      "info",
      `RustDedicated.exe ${this.adapter.generateRedactedLaunchArguments(settings).join(" ")}`
    );
    this.state = "starting";
    this.requestedStop = false;
    this.child = this.runner.spawn(paths.rustDedicatedExe, args, { cwd: paths.serverDir });
    this.startedAt = new Date();
    this.storage.markStart();
    this.child.stdout.on("data", (data: Buffer) => this.pipeLines("stdout", data));
    this.child.stderr.on("data", (data: Buffer) => this.pipeLines("stderr", data));
    this.child.on("exit", (code, signal) => this.handleExit(code, signal));
    this.child.on("error", (error) => {
      this.logger.emit("rust-server", "stderr", "error", error.message);
    });
  }

  sendConsoleCommand(command: string): void {
    if (!this.child || !this.child.stdin.writable) {
      throw new Error("Server console is not available. RCON will be added in phase 2 as a more reliable channel.");
    }
    this.logger.emit("rust-server", "input", "info", command);
    this.child.stdin.write(`${command}\n`);
  }

  async stop(settings: ServerSettings, forced = false): Promise<void> {
    if (!this.child) return;
    this.state = "stopping";
    this.requestedStop = true;
    if (!forced) {
      try {
        this.sendConsoleCommand("server.save");
        this.sendConsoleCommand("quit");
      } catch (error) {
        this.logger.emit("rustpilot", "system", "warn", String(error));
      }
      const timeout = settings.gracefulShutdownTimeoutSeconds * 1000;
      const stopped = await this.waitForExit(timeout);
      if (stopped) return;
      this.logger.emit("rustpilot", "system", "warn", "Graceful shutdown timeout reached; forcing the process to stop.");
    }
    this.child.kill("SIGTERM");
    const stopped = await this.waitForExit(5000);
    if (!stopped && this.child) {
      this.child.kill("SIGKILL");
    }
  }

  async restart(settings: ServerSettings): Promise<void> {
    if (this.restartInProgress) throw new Error("A restart is already running.");
    this.restartInProgress = true;
    this.state = "restarting";
    try {
      await this.stop(settings);
      await this.start(settings);
    } finally {
      this.restartInProgress = false;
    }
  }

  async shutdown(settings: ServerSettings): Promise<void> {
    if (this.child) await this.stop(settings);
  }

  private pipeLines(stream: "stdout" | "stderr", data: Buffer): void {
    for (const line of data.toString("utf8").split(/\r?\n/).filter(Boolean)) {
      if (this.state === "starting") this.state = "running";
      this.logger.emit("rust-server", stream, stream === "stderr" ? "warn" : "info", line);
    }
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    const crashed = !this.requestedStop && code !== 0;
    this.storage.markStop(code, signal, crashed);
    this.logger.emit(
      "rust-server",
      "system",
      crashed ? "error" : "info",
      `RustDedicated.exe stopped with exit code ${code ?? "null"} signal ${signal ?? "null"}.`
    );
    this.child?.removeAllListeners();
    this.child = null;
    this.startedAt = null;
    this.state = crashed ? "crashed" : "stopped";
  }

  private waitForExit(timeoutMs: number): Promise<boolean> {
    const child = this.child;
    if (!child) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        child.off("exit", onExit);
      };
      const onExit = () => {
        cleanup();
        resolve(true);
      };
      child.once("exit", onExit);
    });
  }
}
