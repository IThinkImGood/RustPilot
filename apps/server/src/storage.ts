import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  defaultServerSettings,
  backupScheduleSchema,
  restartScheduleSchema,
  type BackupScheduleConfig,
  serverSettingsSchema,
  type InstallationState,
  type RestartScheduleConfig,
  type ServerSettings,
  type SetupStatus
} from "@rustpilot/shared";

export class Storage {
  private db!: DatabaseSync;

  constructor(private readonly dbPath: string) {}

  open(): void {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        installation_state TEXT NOT NULL,
        setup_completed INTEGER NOT NULL,
        install_error TEXT,
        last_start TEXT,
        last_stop TEXT,
        last_exit_code INTEGER,
        last_signal TEXT,
        last_crash_at TEXT,
        last_known_version TEXT
      );
      INSERT OR IGNORE INTO runtime (id, installation_state, setup_completed)
      VALUES (1, 'not_configured', 0);
    `);
  }

  getSettings(): ServerSettings {
    return this.getSettingsRecord().settings;
  }

  getSettingsRecord(): { exists: boolean; settings: ServerSettings; valid: boolean } {
    const row = this.db.prepare("SELECT value FROM settings WHERE id = 'default'").get() as
      | { value: string }
      | undefined;
    if (!row) return { exists: false, settings: defaultServerSettings, valid: false };
    const parsed = serverSettingsSchema.safeParse(JSON.parse(row.value));
    return {
      exists: true,
      settings: parsed.success ? parsed.data : defaultServerSettings,
      valid: parsed.success
    };
  }

  saveSettings(settings: ServerSettings): void {
    const parsed = serverSettingsSchema.parse(settings);
    this.db
      .prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('default', ?)")
      .run(JSON.stringify(parsed));
  }

  resetSetup(): void {
    this.db.prepare("DELETE FROM settings WHERE id = 'default'").run();
    this.clearScheduledRestart();
    this.saveRestartSchedule({ enabled: false, times: [], reason: null });
    this.saveBackupSchedule({ enabled: false, times: [], retentionCount: 20 });
    this.db
      .prepare(
        "UPDATE runtime SET installation_state = 'not_configured', setup_completed = 0, install_error = NULL, last_start = NULL, last_stop = NULL, last_exit_code = NULL, last_signal = NULL, last_crash_at = NULL WHERE id = 1"
      )
      .run();
  }

  getSetupStatus(steamCmdInstalled: boolean, serverInstalled: boolean): SetupStatus {
    const row = this.db.prepare("SELECT * FROM runtime WHERE id = 1").get() as any;
    const configured = Boolean(
      this.db.prepare("SELECT value FROM settings WHERE id = 'default'").get()
    );
    return {
      completed: Boolean(row.setup_completed),
      installationState: row.installation_state,
      steamCmdInstalled,
      serverInstalled,
      configured,
      installError: row.install_error ?? null
    };
  }

  getRuntimeSetup(): {
    setupCompleted: boolean;
    installationState: InstallationState;
    installError: string | null;
  } {
    const row = this.db.prepare("SELECT * FROM runtime WHERE id = 1").get() as any;
    return {
      setupCompleted: Boolean(row.setup_completed),
      installationState: row.installation_state,
      installError: row.install_error ?? null
    };
  }

  setInstallationState(state: InstallationState, error: string | null = null): void {
    this.db
      .prepare("UPDATE runtime SET installation_state = ?, install_error = ? WHERE id = 1")
      .run(state, error);
  }

  setSetupCompleted(completed: boolean): void {
    this.db.prepare("UPDATE runtime SET setup_completed = ? WHERE id = 1").run(completed ? 1 : 0);
  }

  markStart(): void {
    this.db.prepare("UPDATE runtime SET last_start = ? WHERE id = 1").run(new Date().toISOString());
  }

  markStop(exitCode: number | null, signal: string | null, crashed: boolean): void {
    this.db
      .prepare(
        "UPDATE runtime SET last_stop = ?, last_exit_code = ?, last_signal = ?, last_crash_at = CASE WHEN ? THEN ? ELSE last_crash_at END WHERE id = 1"
      )
      .run(new Date().toISOString(), exitCode, signal, crashed ? 1 : 0, new Date().toISOString());
  }

  getScheduledRestart(): { runAt: string; reason: string | null } | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'scheduled_restart'").get() as
      | { value: string }
      | undefined;
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.value) as { runAt?: unknown; reason?: unknown };
      if (typeof parsed.runAt !== "string") return null;
      return {
        runAt: parsed.runAt,
        reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason : null
      };
    } catch {
      return null;
    }
  }

  saveScheduledRestart(runAt: string, reason: string | null): void {
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('scheduled_restart', ?)")
      .run(JSON.stringify({ runAt, reason }));
  }

  clearScheduledRestart(): void {
    this.db.prepare("DELETE FROM meta WHERE key = 'scheduled_restart'").run();
  }

  getRestartSchedule(): RestartScheduleConfig {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'restart_schedule'").get() as
      | { value: string }
      | undefined;
    if (!row) return { enabled: false, times: [], reason: null };
    try {
      const parsed = restartScheduleSchema.safeParse(JSON.parse(row.value));
      if (!parsed.success) return { enabled: false, times: [], reason: null };
      return {
        enabled: parsed.data.enabled,
        times: [...new Set(parsed.data.times)].sort(),
        reason: parsed.data.reason || null
      };
    } catch {
      return { enabled: false, times: [], reason: null };
    }
  }

  saveRestartSchedule(schedule: RestartScheduleConfig): RestartScheduleConfig {
    const parsed = restartScheduleSchema.parse(schedule);
    const normalized = {
      enabled: parsed.enabled,
      times: [...new Set(parsed.times)].sort(),
      reason: parsed.reason || null
    };
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('restart_schedule', ?)")
      .run(JSON.stringify(normalized));
    return normalized;
  }

  getBackupSchedule(): BackupScheduleConfig {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'backup_schedule'").get() as
      | { value: string }
      | undefined;
    if (!row) return { enabled: false, times: [], retentionCount: 20 };
    try {
      const parsed = backupScheduleSchema.safeParse(JSON.parse(row.value));
      if (!parsed.success) return { enabled: false, times: [], retentionCount: 20 };
      return {
        enabled: parsed.data.enabled,
        times: [...new Set(parsed.data.times)].sort(),
        retentionCount: parsed.data.retentionCount
      };
    } catch {
      return { enabled: false, times: [], retentionCount: 20 };
    }
  }

  saveBackupSchedule(schedule: BackupScheduleConfig): BackupScheduleConfig {
    const parsed = backupScheduleSchema.parse(schedule);
    const normalized = {
      enabled: parsed.enabled,
      times: [...new Set(parsed.times)].sort(),
      retentionCount: parsed.retentionCount
    };
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('backup_schedule', ?)")
      .run(JSON.stringify(normalized));
    return normalized;
  }

  getRuntimeMeta(): {
    lastStart: string | null;
    lastStop: string | null;
    lastExitCode: number | null;
    lastSignal: string | null;
    lastCrashAt: string | null;
  } {
    const row = this.db.prepare("SELECT * FROM runtime WHERE id = 1").get() as any;
    return {
      lastStart: row.last_start ?? null,
      lastStop: row.last_stop ?? null,
      lastExitCode: row.last_exit_code ?? null,
      lastSignal: row.last_signal ?? null,
      lastCrashAt: row.last_crash_at ?? null
    };
  }
}
