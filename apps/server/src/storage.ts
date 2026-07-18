import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultServerSettings, serverSettingsSchema, type InstallationState, type ServerSettings, type SetupStatus } from "@rustpilot/shared";

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
