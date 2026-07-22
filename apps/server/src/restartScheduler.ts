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
  ) {
    this.restorePersistedSchedule();
  }

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
    this.storage.saveScheduledRestart(this.runAt.toISOString(), this.reason);
    this.armTimer(this.runAt);
    this.logger.emit("rustpilot", "system", "warn", `Server restart scheduled for ${this.runAt.toLocaleString()}.`);
    return this.getStatus();
  }

  cancel(): ScheduledRestartStatus {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.runAt = null;
    this.reason = null;
    this.storage.clearScheduledRestart();
    return this.getStatus();
  }

  private restorePersistedSchedule(): void {
    const persisted = this.storage.getScheduledRestart();
    if (!persisted) return;
    const runAt = new Date(persisted.runAt);
    if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
      this.storage.clearScheduledRestart();
      this.logger.emit("rustpilot", "system", "warn", "Expired scheduled restart was cleared.");
      return;
    }
    this.runAt = runAt;
    this.reason = persisted.reason;
    this.armTimer(runAt);
    this.logger.emit("rustpilot", "system", "warn", `Restored scheduled restart for ${runAt.toLocaleString()}.`);
  }

  private armTimer(runAt: Date): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const message = this.reason ? `Scheduled restart: ${this.reason}` : "Scheduled restart.";
      this.logger.emit("rustpilot", "system", "warn", message);
      this.storage.clearScheduledRestart();
      this.processManager.restart(this.storage.getSettings()).catch((error) => {
        this.logger.emit("rustpilot", "system", "error", error instanceof Error ? error.message : String(error));
      });
      this.runAt = null;
      this.reason = null;
    }, Math.max(1, runAt.getTime() - Date.now()));
  }
}
