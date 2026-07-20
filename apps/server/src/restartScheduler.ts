import type { ScheduledRestartStatus } from "@rustpilot/shared";
import type { EventLogger } from "./logger.js";
import type { ServerProcessManager } from "./serverProcessManager.js";
import type { Storage } from "./storage.js";

export class RestartScheduler {
  private timer: NodeJS.Timeout | null = null;
  private runAt: Date | null = null;
  private reason: string | null = null;

  constructor(
    private readonly storage: Storage,
    private readonly processManager: ServerProcessManager,
    private readonly logger: EventLogger
  ) {}

  getStatus(): ScheduledRestartStatus {
    return {
      scheduled: this.timer !== null,
      runAt: this.runAt?.toISOString() ?? null,
      reason: this.reason
    };
  }

  schedule(delayMinutes: number, reason: string | null): ScheduledRestartStatus {
    if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 1440) {
      throw new Error("Restart delay must be between 1 and 1440 minutes.");
    }
    this.cancel();
    this.runAt = new Date(Date.now() + delayMinutes * 60_000);
    this.reason = reason;
    this.timer = setTimeout(() => {
      this.timer = null;
      const message = this.reason ? `Scheduled restart: ${this.reason}` : "Scheduled restart.";
      this.logger.emit("rustpilot", "system", "warn", message);
      this.processManager.restart(this.storage.getSettings()).catch((error) => {
        this.logger.emit("rustpilot", "system", "error", error instanceof Error ? error.message : String(error));
      });
      this.runAt = null;
      this.reason = null;
    }, delayMinutes * 60_000);
    this.logger.emit("rustpilot", "system", "warn", `Server restart scheduled for ${this.runAt.toLocaleString()}.`);
    return this.getStatus();
  }

  cancel(): ScheduledRestartStatus {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.runAt = null;
    this.reason = null;
    return this.getStatus();
  }
}
