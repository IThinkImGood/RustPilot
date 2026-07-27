import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  defaultServerSettings,
  backupScheduleSchema,
  defaultWipePlannerConfig,
  restartScheduleSchema,
  wipePlannerConfigSchema,
  type BackupScheduleConfig,
  type AuthActionLogEntry,
  type AuthPermission,
  type AuthRole,
  type AuthUser,
  serverSettingsSchema,
  type InstallationState,
  type RestartScheduleConfig,
  type ServerSettings,
  type SetupStatus,
  type WipePlannerConfig
} from "@rustpilot/shared";

function permissionsForRole(role: AuthRole): AuthPermission[] {
  if (role === "owner") {
    return ["manage.users", "settings.write", "server.control", "console.write", "announcement", "players.kick", "players.ban", "cfg.write", "backups.write", "wipes.write", "danger.write"];
  }
  if (role === "admin") {
    return ["settings.write", "server.control", "console.write", "announcement", "players.kick", "players.ban", "cfg.write", "backups.write", "wipes.write"];
  }
  return [];
}

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
      CREATE TABLE IF NOT EXISTS auth_users (
        steam_id64 TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        steam_id64 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (steam_id64) REFERENCES auth_users(steam_id64) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS auth_action_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        steam_id64 TEXT,
        display_name TEXT,
        role TEXT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        action TEXT NOT NULL,
        status_code INTEGER,
        success INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO runtime (id, installation_state, setup_completed)
      VALUES (1, 'not_configured', 0);
    `);
  }

  hasAuthOwner(): boolean {
    const row = this.db.prepare("SELECT 1 FROM auth_users WHERE role = 'owner' AND enabled = 1 LIMIT 1").get();
    return Boolean(row);
  }

  listAuthUsers(): AuthUser[] {
    const rows = this.db
      .prepare("SELECT steam_id64, display_name, role, enabled, created_at, last_login_at FROM auth_users ORDER BY role = 'owner' DESC, created_at ASC")
      .all() as Array<{
        steam_id64: string;
        display_name: string;
        role: AuthRole;
        enabled: number;
        created_at: string;
        last_login_at: string | null;
      }>;
    return rows.map((row) => ({
      steamId64: row.steam_id64,
      displayName: row.display_name,
      role: row.role,
      permissions: permissionsForRole(row.role),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    }));
  }

  getAuthUser(steamId64: string): AuthUser | null {
    const row = this.db
      .prepare("SELECT steam_id64, display_name, role, enabled, created_at, last_login_at FROM auth_users WHERE steam_id64 = ?")
      .get(steamId64) as
      | {
          steam_id64: string;
          display_name: string;
          role: AuthRole;
          enabled: number;
          created_at: string;
          last_login_at: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      steamId64: row.steam_id64,
      displayName: row.display_name,
      role: row.role,
      permissions: permissionsForRole(row.role),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    };
  }

  saveAuthUser(user: { steamId64: string; displayName: string; role: AuthRole; enabled: boolean }): AuthUser {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO auth_users (steam_id64, display_name, role, enabled, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, NULL) ON CONFLICT(steam_id64) DO UPDATE SET display_name = excluded.display_name, role = excluded.role, enabled = excluded.enabled"
      )
      .run(user.steamId64, user.displayName, user.role, user.enabled ? 1 : 0, now);
    const saved = this.getAuthUser(user.steamId64);
    if (!saved) throw new Error("Auth user was not saved.");
    return saved;
  }

  deleteAuthUser(steamId64: string): boolean {
    const existing = this.getAuthUser(steamId64);
    if (!existing) return false;
    if (existing.role === "owner" && this.listAuthUsers().filter((user) => user.role === "owner" && user.enabled).length <= 1) {
      throw new Error("At least one enabled owner is required.");
    }
    this.db.prepare("DELETE FROM auth_sessions WHERE steam_id64 = ?").run(steamId64);
    this.db.prepare("DELETE FROM auth_users WHERE steam_id64 = ?").run(steamId64);
    return true;
  }

  markAuthLogin(steamId64: string): void {
    this.db.prepare("UPDATE auth_users SET last_login_at = ? WHERE steam_id64 = ?").run(new Date().toISOString(), steamId64);
  }

  saveAuthSession(tokenHash: string, steamId64: string, expiresAt: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO auth_sessions (token_hash, steam_id64, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(tokenHash, steamId64, new Date().toISOString(), expiresAt);
  }

  getAuthSession(tokenHash: string): { tokenHash: string; user: AuthUser; expiresAt: string } | null {
    const row = this.db
      .prepare(
        "SELECT s.token_hash, s.expires_at, u.steam_id64, u.display_name, u.role, u.enabled, u.created_at, u.last_login_at FROM auth_sessions s JOIN auth_users u ON u.steam_id64 = s.steam_id64 WHERE s.token_hash = ?"
      )
      .get(tokenHash) as
      | {
          token_hash: string;
          expires_at: string;
          steam_id64: string;
          display_name: string;
          role: AuthRole;
          enabled: number;
          created_at: string;
          last_login_at: string | null;
        }
      | undefined;
    if (!row || new Date(row.expires_at).getTime() <= Date.now() || !row.enabled) {
      if (row) this.deleteAuthSession(tokenHash);
      return null;
    }
    return {
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      user: {
        steamId64: row.steam_id64,
        displayName: row.display_name,
        role: row.role,
        permissions: permissionsForRole(row.role),
        enabled: Boolean(row.enabled),
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at
      }
    };
  }

  deleteAuthSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
  }

  pruneExpiredAuthSessions(): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(new Date().toISOString());
  }

  recordAuthActionLog(entry: Omit<AuthActionLogEntry, "id" | "timestamp">): void {
    this.db
      .prepare(
        "INSERT INTO auth_action_logs (timestamp, steam_id64, display_name, role, method, path, action, status_code, success) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        new Date().toISOString(),
        entry.steamId64,
        entry.displayName,
        entry.role,
        entry.method,
        entry.path,
        entry.action,
        entry.statusCode,
        entry.success ? 1 : 0
      );
  }

  listAuthActionLogs(limit = 200): AuthActionLogEntry[] {
    const rows = this.db
      .prepare(
        "SELECT id, timestamp, steam_id64, display_name, role, method, path, action, status_code, success FROM auth_action_logs ORDER BY id DESC LIMIT ?"
      )
      .all(limit) as Array<{
        id: number;
        timestamp: string;
        steam_id64: string | null;
        display_name: string | null;
        role: AuthRole | null;
        method: string;
        path: string;
        action: string;
        status_code: number | null;
        success: number;
      }>;
    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      steamId64: row.steam_id64,
      displayName: row.display_name,
      role: row.role,
      method: row.method,
      path: row.path,
      action: row.action,
      statusCode: row.status_code,
      success: Boolean(row.success)
    }));
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
    this.saveWipePlannerConfig(defaultWipePlannerConfig);
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

  getWipePlannerConfig(): WipePlannerConfig {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'wipe_planner_config'").get() as
      | { value: string }
      | undefined;
    if (!row) return wipePlannerConfigSchema.parse(defaultWipePlannerConfig);
    try {
      const parsed = wipePlannerConfigSchema.safeParse(JSON.parse(row.value));
      if (!parsed.success) return wipePlannerConfigSchema.parse(defaultWipePlannerConfig);
      return parsed.data;
    } catch {
      return wipePlannerConfigSchema.parse(defaultWipePlannerConfig);
    }
  }

  saveWipePlannerConfig(config: WipePlannerConfig): WipePlannerConfig {
    const parsed = wipePlannerConfigSchema.parse(config);
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('wipe_planner_config', ?)")
      .run(JSON.stringify(parsed));
    this.db.prepare("DELETE FROM meta WHERE key = 'wipe_plan'").run();
    return parsed;
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
