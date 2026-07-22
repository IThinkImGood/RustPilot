import fs from "node:fs";
import type { RustAdapter } from "@rustpilot/rust-adapter";
import type { BackupScheduleConfig, BackupScheduleStatus } from "@rustpilot/shared";
import { createManualBackup, listManualBackups } from "./backups.js";
import { computeSetupStatus } from "./setupStatus.js";
import type { EventLogger } from "./logger.js";
import type { Storage } from "./storage.js";

export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private runAt: Date | null = null;
  private scheduleConfig: BackupScheduleConfig = { enabled: false, times: [], retentionCount: 20 };
  private lastBackupAt: string | null = null;
  private lastBackupFileName: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly storage: Storage,
    private readonly adapter: RustAdapter,
    private readonly logger: EventLogger
  ) {
    this.scheduleConfig = this.storage.getBackupSchedule();
    this.armNextBackup();
  }

  getStatus(): BackupScheduleStatus {
    return {
      scheduled: this.timer !== null,
      runAt: this.runAt?.toISOString() ?? null,
      schedule: this.scheduleConfig,
      lastBackupAt: this.lastBackupAt,
      lastBackupFileName: this.lastBackupFileName,
      lastError: this.lastError
    };
  }

  saveSchedule(schedule: BackupScheduleConfig): BackupScheduleStatus {
    this.scheduleConfig = this.storage.saveBackupSchedule(schedule);
    this.clearTimer();
    this.armNextBackup();
    return this.getStatus();
  }

  runNow(): void {
    const setup = computeSetupStatus(this.storage, this.adapter);
    if (!setup.setupCompleted) throw new Error("Complete the RustPilot installation first.");
    const backup = createManualBackup(this.adapter, this.storage.getSettings());
    this.lastBackupAt = backup.createdAt;
    this.lastBackupFileName = backup.fileName;
    this.lastError = null;
    this.pruneOldBackups();
    this.logger.emit("rustpilot", "system", "info", `Automatic backup created: ${backup.fileName}`);
  }

  stop(): void {
    this.clearTimer();
  }

  private armNextBackup(): void {
    if (!this.scheduleConfig.enabled || this.scheduleConfig.times.length === 0) return;
    this.runAt = nextBackupRunAt(this.scheduleConfig.times);
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.runNow();
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.logger.emit("rustpilot", "system", "error", `Automatic backup failed: ${this.lastError}`);
      } finally {
        this.runAt = null;
        this.armNextBackup();
      }
    }, Math.max(1, this.runAt.getTime() - Date.now()));
    this.logger.emit("rustpilot", "system", "info", `Next automatic backup scheduled for ${this.runAt.toLocaleString()}.`);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.runAt = null;
  }

  private pruneOldBackups(): void {
    const settings = this.storage.getSettings();
    const backups = listManualBackups(this.adapter, settings);
    for (const backup of backups.slice(this.scheduleConfig.retentionCount)) {
      try {
        fs.rmSync(backup.path, { force: true });
        this.logger.emit("rustpilot", "system", "info", `Old backup pruned: ${backup.fileName}`);
      } catch {
        // Best effort retention cleanup must not fail the backup itself.
      }
    }
  }
}

export function nextBackupRunAt(times: string[], now = new Date()): Date {
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
