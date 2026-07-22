import type { RestartScheduleConfig, ScheduledRestartStatus } from "@rustpilot/shared";
import type { EventLogger } from "./logger.js";
import type { ServerProcessManager } from "./serverProcessManager.js";
import type { Storage } from "./storage.js";

export class RestartScheduler {
  private timer: NodeJS.Timeout | null = null;
  private announcementTimers: NodeJS.Timeout[] = [];
  private runAt: Date | null = null;
  private reason: string | null = null;
  private kind: ScheduledRestartStatus["kind"] = "none";
  private dailySchedule: RestartScheduleConfig = { enabled: false, times: [], reason: null };

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
      reason: this.reason,
      kind: this.kind,
      schedule: this.dailySchedule
    };
  }

  schedule(delayMinutes: number, reason: string | null): ScheduledRestartStatus {
    if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 1440) {
      throw new Error("Restart delay must be between 1 and 1440 minutes.");
    }
    this.clearActiveTimer();
    this.storage.clearScheduledRestart();
    this.runAt = new Date(Date.now() + delayMinutes * 60_000);
    this.reason = reason;
    this.kind = "one_time";
    this.storage.saveScheduledRestart(this.runAt.toISOString(), this.reason);
    this.armTimer(this.runAt);
    this.logger.emit("rustpilot", "system", "warn", `Server restart scheduled for ${this.runAt.toLocaleString()}.`);
    return this.getStatus();
  }

  cancel(): ScheduledRestartStatus {
    this.clearActiveTimer();
    this.storage.clearScheduledRestart();
    this.armNextDailyRestart();
    return this.getStatus();
  }

  saveDailySchedule(schedule: RestartScheduleConfig): ScheduledRestartStatus {
    this.dailySchedule = this.storage.saveRestartSchedule(schedule);
    if (this.kind !== "one_time") {
      this.clearActiveTimer();
      this.armNextDailyRestart();
    }
    return this.getStatus();
  }

  private restorePersistedSchedule(): void {
    this.dailySchedule = this.storage.getRestartSchedule();
    const persisted = this.storage.getScheduledRestart();
    if (!persisted) {
      this.armNextDailyRestart();
      return;
    }
    const runAt = new Date(persisted.runAt);
    if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
      this.storage.clearScheduledRestart();
      this.logger.emit("rustpilot", "system", "warn", "Expired scheduled restart was cleared.");
      this.armNextDailyRestart();
      return;
    }
    this.runAt = runAt;
    this.reason = persisted.reason;
    this.kind = "one_time";
    this.armTimer(runAt);
    this.logger.emit("rustpilot", "system", "warn", `Restored scheduled restart for ${runAt.toLocaleString()}.`);
  }

  private armTimer(runAt: Date): void {
    if (this.timer) clearTimeout(this.timer);
    this.clearAnnouncementTimers();
    this.armCountdownAnnouncements(runAt);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.clearAnnouncementTimers();
      const message = this.reason ? `Scheduled restart: ${this.reason}` : "Scheduled restart.";
      this.logger.emit("rustpilot", "system", "warn", message);
      if (this.kind === "one_time") this.storage.clearScheduledRestart();
      this.processManager.restart(this.storage.getSettings()).catch((error) => {
        this.logger.emit("rustpilot", "system", "error", error instanceof Error ? error.message : String(error));
      });
      this.runAt = null;
      this.reason = null;
      const completedKind = this.kind;
      this.kind = "none";
      if (completedKind === "daily") this.armNextDailyRestart();
      if (completedKind === "one_time") this.armNextDailyRestart();
    }, Math.max(1, runAt.getTime() - Date.now()));
  }

  private clearActiveTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.clearAnnouncementTimers();
    this.runAt = null;
    this.reason = null;
    this.kind = "none";
  }

  private clearAnnouncementTimers(): void {
    for (const timer of this.announcementTimers) clearTimeout(timer);
    this.announcementTimers = [];
  }

  private armCountdownAnnouncements(runAt: Date): void {
    const settings = this.storage.getSettings();
    for (const minutes of restartAnnouncementMinutes(runAt)) {
      const timer = setTimeout(() => {
        this.processManager.sendConsoleCommand(settings, buildRestartAnnouncementCommand(minutes, this.reason)).catch((error) => {
          this.logger.emit("rustpilot", "system", "warn", `Restart announcement failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }, runAt.getTime() - Date.now() - minutes * 60_000);
      this.announcementTimers.push(timer);
    }
  }

  private armNextDailyRestart(): void {
    if (!this.dailySchedule.enabled || this.dailySchedule.times.length === 0) return;
    const runAt = nextDailyRunAt(this.dailySchedule.times);
    this.runAt = runAt;
    this.reason = this.dailySchedule.reason;
    this.kind = "daily";
    this.armTimer(runAt);
    this.logger.emit("rustpilot", "system", "warn", `Next daily restart scheduled for ${runAt.toLocaleString()}.`);
  }
}

export function restartAnnouncementMinutes(runAt: Date, now = new Date()): number[] {
  const remainingMs = runAt.getTime() - now.getTime();
  return [15, 5, 1].filter((minutes) => remainingMs > minutes * 60_000);
}

export function buildRestartAnnouncementCommand(minutes: number, reason: string | null): string {
  const suffix = reason ? ` Reason: ${reason}` : "";
  return `say "${escapeRustConsoleText(`Server restart in ${minutes} minute${minutes === 1 ? "" : "s"}.${suffix}`)}"`;
}

export function nextDailyRunAt(times: string[], now = new Date()): Date {
  const sorted = [...new Set(times)].sort();
  for (const time of sorted) {
    const candidate = dateAtLocalTime(time, now);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateAtLocalTime(sorted[0] ?? "00:00", tomorrow);
}

function dateAtLocalTime(time: string, date: Date): Date {
  const [hoursRaw, minutesRaw] = time.split(":");
  const result = new Date(date);
  result.setHours(Number(hoursRaw), Number(minutesRaw), 0, 0);
  return result;
}

function escapeRustConsoleText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
