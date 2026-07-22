import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import type { RustAdapter } from "@rustpilot/rust-adapter";
import type {
  AdditionalWipeScheduleConfig,
  ServerSettings,
  WipeKind,
  WipePlannerConfig,
  WipePlannerStatus,
  WipePlanSource,
  WipeResult,
  WipeSeedMode
} from "@rustpilot/shared";
import { defaultWipePlannerConfig } from "@rustpilot/shared";
import { createManualBackup } from "./backups.js";
import { computeSetupStatus } from "./setupStatus.js";
import type { EventLogger } from "./logger.js";
import type { InstallManager } from "./installManager.js";
import type { ServerProcessManager } from "./serverProcessManager.js";
import type { Storage } from "./storage.js";

const OFFICIAL_WIPE_TIMEZONE = "Europe/London";
const OFFICIAL_WIPE_DAY = 4;
const OFFICIAL_WIPE_HOUR = 19;

const MAP_PATTERNS = [
  /^proceduralmap\..+\.(map|sav)$/i,
  /^barren\..+\.(map|sav)$/i,
  /^craggyisland\..+\.(map|sav)$/i,
  /^hapisisland\..+\.(map|sav)$/i,
  /^sav\.?(?:\d+)?$/i,
  /^.*\.(map|sav)\.(?:bak|old|\d+)$/i
];

const BLUEPRINT_PATTERNS = [
  /^player\.blueprints.*\.db(?:-(?:wal|shm|journal))?$/i,
  /^player\.blueprints.*$/i
];

interface PendingWipeAction {
  runAt: Date;
  source: WipePlanSource;
  officialRunAt: Date | null;
  customRunAt: Date | null;
  customReplacedByOfficial: boolean;
  kind: WipeKind;
  seedMode: WipeSeedMode;
  seed: number | null;
  reason: string | null;
  backupBeforeWipe: boolean;
  updateBeforeWipe: boolean;
  restartAfterWipe: boolean;
}

export class WipePlanner {
  private timer: NodeJS.Timeout | null = null;
  private action: PendingWipeAction | null = null;
  private lastResult: WipeResult | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly storage: Storage,
    private readonly adapter: RustAdapter,
    private readonly installer: InstallManager,
    private readonly processManager: ServerProcessManager,
    private readonly logger: EventLogger
  ) {
    this.restore();
  }

  getStatus(): WipePlannerStatus {
    const config = this.storage.getWipePlannerConfig();
    const action = this.computePendingAction(config);
    return {
      scheduled: action !== null,
      runAt: action?.runAt.toISOString() ?? null,
      source: action?.source ?? null,
      officialRunAt: action?.officialRunAt?.toISOString() ?? null,
      customRunAt: action?.customRunAt?.toISOString() ?? null,
      customReplacedByOfficial: action?.customReplacedByOfficial ?? false,
      config,
      lastWipeAt: this.lastResult?.wipedAt ?? null,
      lastResult: this.lastResult,
      lastError: this.lastError
    };
  }

  saveConfig(config: WipePlannerConfig): WipePlannerStatus {
    this.ensureSetupComplete();
    const saved = this.storage.saveWipePlannerConfig(config);
    this.planNext(saved);
    return this.getStatus();
  }

  cancelCustomSchedule(): WipePlannerStatus {
    const config = this.storage.getWipePlannerConfig();
    const saved = this.storage.saveWipePlannerConfig({
      ...config,
      custom: { ...defaultWipePlannerConfig.custom }
    });
    this.planNext(saved);
    return this.getStatus();
  }

  async runNow(plan: Pick<AdditionalWipeScheduleConfig, "kind" | "seedMode" | "seed" | "reason" | "backupBeforeWipe" | "restartAfterWipe">): Promise<WipeResult> {
    this.ensureSetupComplete();
    return this.execute({
      runAt: new Date(),
      source: "custom",
      officialRunAt: null,
      customRunAt: new Date(),
      customReplacedByOfficial: false,
      kind: plan.kind,
      seedMode: plan.seedMode,
      seed: plan.seed,
      reason: plan.reason,
      backupBeforeWipe: plan.backupBeforeWipe,
      updateBeforeWipe: false,
      restartAfterWipe: plan.restartAfterWipe
    });
  }

  stop(): void {
    this.clearTimer();
  }

  private restore(): void {
    this.planNext(this.storage.getWipePlannerConfig());
  }

  private planNext(config: WipePlannerConfig): void {
    this.clearTimer();
    this.action = this.computePendingAction(config);
    if (!this.action) return;
    this.armTimer(this.action);
  }

  private computePendingAction(config: WipePlannerConfig, from = new Date()): PendingWipeAction | null {
    const officialRunAt = config.official.enabled ? computeNextOfficialForceWipe(from) : null;
    const customRunAt = computeNextCustomWipe(config.custom, from);
    if (!officialRunAt && !customRunAt) return null;
    if (officialRunAt && customRunAt) {
      const conflictMs = config.conflictWindowMinutes * 60_000;
      const combined = Math.abs(officialRunAt.getTime() - customRunAt.getTime()) <= conflictMs;
      if (combined) {
        const seed = combineSeedMode(config.official.seedMode, config.official.seed, config.custom.seedMode, config.custom.seed);
        return {
          runAt: officialRunAt,
          source: "combined",
          officialRunAt,
          customRunAt,
          customReplacedByOfficial: true,
          kind: combineWipeKinds(config.official.kind, config.custom.kind),
          seedMode: seed.seedMode,
          seed: seed.seed,
          reason: config.custom.reason,
          backupBeforeWipe: config.custom.backupBeforeWipe,
          updateBeforeWipe: true,
          restartAfterWipe: config.official.restartAfterWipe || config.custom.restartAfterWipe
        };
      }
    }
    if (officialRunAt && (!customRunAt || officialRunAt.getTime() <= customRunAt.getTime())) {
      return {
        runAt: officialRunAt,
        source: "official",
        officialRunAt,
        customRunAt,
        customReplacedByOfficial: false,
        kind: config.official.kind,
        seedMode: config.official.seedMode,
        seed: config.official.seed,
        reason: "Official Rust force wipe",
        backupBeforeWipe: true,
        updateBeforeWipe: true,
        restartAfterWipe: config.official.restartAfterWipe
      };
    }
    if (!customRunAt) return null;
    return {
      runAt: customRunAt,
      source: "custom",
      officialRunAt,
      customRunAt,
      customReplacedByOfficial: false,
      kind: config.custom.kind,
      seedMode: config.custom.seedMode,
      seed: config.custom.seed,
      reason: config.custom.reason,
      backupBeforeWipe: config.custom.backupBeforeWipe,
      updateBeforeWipe: false,
      restartAfterWipe: config.custom.restartAfterWipe
    };
  }

  private armTimer(action: PendingWipeAction): void {
    this.timer = setTimeout(() => {
      const activeAction = this.action;
      this.clearTimer();
      if (!activeAction) return;
      this.execute(activeAction)
        .then(() => {
          const config = this.clearCompletedOneTimeCustom(activeAction);
          this.planNext(config);
        })
        .catch((error) => {
          this.lastError = error instanceof Error ? error.message : String(error);
          this.logger.emit("rustpilot", "system", "error", `Planned wipe failed: ${this.lastError}`);
          this.planNext(this.storage.getWipePlannerConfig());
        });
    }, Math.max(1, action.runAt.getTime() - Date.now()));
  }

  private clearCompletedOneTimeCustom(action: PendingWipeAction): WipePlannerConfig {
    const config = this.storage.getWipePlannerConfig();
    if ((action.source === "custom" || action.source === "combined") && config.custom.schedule === "one_time") {
      return this.storage.saveWipePlannerConfig({
        ...config,
        custom: { ...defaultWipePlannerConfig.custom }
      });
    }
    return config;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private ensureSetupComplete(): void {
    const setup = computeSetupStatus(this.storage, this.adapter);
    if (!setup.setupCompleted) throw new Error("Complete the RustPilot installation first.");
  }

  private async execute(action: PendingWipeAction): Promise<WipeResult> {
    const settings = this.storage.getSettings();
    await this.processManager.stop(settings);
    let steamCmdUpdated = false;
    if (action.updateBeforeWipe) {
      await this.installer.update(settings);
      steamCmdUpdated = true;
    }
    const backup = action.backupBeforeWipe ? createManualBackup(this.adapter, settings) : null;
    const removedFiles = wipeRustFiles(this.adapter, settings.identity, settings.installDirectory, action.kind);
    const seed = this.applySeedIfNeeded(settings, action.kind, action.seedMode, action.seed);
    if (action.restartAfterWipe) await this.processManager.start(this.storage.getSettings());
    const result: WipeResult = {
      kind: action.kind,
      wipedAt: new Date().toISOString(),
      source: action.source,
      backupFileName: backup?.fileName ?? null,
      removedFiles,
      steamCmdUpdated,
      seed
    };
    this.lastResult = result;
    this.lastError = null;
    this.logger.emit(
      "rustpilot",
      "system",
      "warn",
      `Wipe completed: ${action.source}, ${action.kind}, removed ${removedFiles.length} file${removedFiles.length === 1 ? "" : "s"}.`
    );
    return result;
  }

  private applySeedIfNeeded(settings: ServerSettings, kind: WipeKind, seedMode: WipeSeedMode, configuredSeed: number | null): number | null {
    if (kind === "blueprints" || seedMode === "keep") return null;
    const seed = seedMode === "random" ? randomInt(0, 2147483648) : configuredSeed;
    if (seed === null) return null;
    this.storage.saveSettings({ ...settings, seed });
    this.logger.emit("rustpilot", "system", "warn", `Next map seed set to ${seed}.`);
    return seed;
  }
}

export function computeNextOfficialForceWipe(from = new Date()): Date {
  const parts = zonedParts(from, OFFICIAL_WIPE_TIMEZONE);
  for (let offset = 0; offset < 24; offset += 1) {
    const monthDate = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1, 12, 0, 0, 0));
    const year = monthDate.getUTCFullYear();
    const month = monthDate.getUTCMonth();
    const runAt = zonedDateTimeToUtc(
      year,
      month,
      firstWeekdayOfMonth(year, month, OFFICIAL_WIPE_DAY),
      OFFICIAL_WIPE_HOUR,
      0,
      OFFICIAL_WIPE_TIMEZONE
    );
    if (runAt.getTime() > from.getTime()) return runAt;
  }
  throw new Error("Could not calculate next official Rust force wipe.");
}

export function computeNextCustomWipe(schedule: AdditionalWipeScheduleConfig, from = new Date()): Date | null {
  if (schedule.schedule === "none") return null;
  if (schedule.schedule === "one_time") return schedule.runAt ? new Date(schedule.runAt) : null;
  if (schedule.schedule === "weekly") return computeNextWeeklyRunAt(schedule.weeklyDay ?? 4, schedule.weeklyTime ?? "19:00", from, 7);
  if (schedule.schedule === "biweekly") return computeNextWeeklyRunAt(schedule.weeklyDay ?? 4, schedule.weeklyTime ?? "19:00", from, 14);
  return computeNextMonthlyWipeTagRunAt(schedule.monthlyWeekday ?? 4, schedule.monthlyTime ?? "19:00", from);
}

export function computeNextWeeklyRunAt(day: number, time: string, from = new Date(), intervalDays = 7): Date {
  const [hours = "0", minutes = "0"] = time.split(":");
  const next = new Date(from);
  next.setHours(Number(hours), Number(minutes), 0, 0);
  const daysUntil = (day - next.getDay() + 7) % 7;
  if (daysUntil > 0) {
    next.setDate(next.getDate() + daysUntil);
  } else if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + intervalDays);
  }
  return next;
}

export function computeNextMonthlyWipeTagRunAt(day: number, time: string, from = new Date()): Date {
  const [hours = "0", minutes = "0"] = time.split(":");
  for (let offset = 0; offset < 24; offset += 1) {
    const candidateMonth = new Date(from.getFullYear(), from.getMonth() + offset, 1, 12, 0, 0, 0);
    const runAt = new Date(
      candidateMonth.getFullYear(),
      candidateMonth.getMonth(),
      firstWeekdayOfMonth(candidateMonth.getFullYear(), candidateMonth.getMonth(), day),
      Number(hours),
      Number(minutes),
      0,
      0
    );
    if (runAt.getTime() > from.getTime()) return runAt;
  }
  throw new Error("Could not calculate next monthly custom wipe.");
}

export function wipeRustFiles(adapter: RustAdapter, identity: string, installDirectory: string, kind: WipeKind): string[] {
  const paths = adapter.getPaths({ identity, installDirectory });
  const rustIdentityDir = path.resolve(paths.serverDir, "server", identity);
  if (!fs.existsSync(rustIdentityDir)) return [];
  const patterns = kind === "map" ? MAP_PATTERNS : kind === "blueprints" ? BLUEPRINT_PATTERNS : [...MAP_PATTERNS, ...BLUEPRINT_PATTERNS];
  const removed: string[] = [];
  for (const entry of fs.readdirSync(rustIdentityDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!patterns.some((pattern) => pattern.test(entry.name))) continue;
    const filePath = path.resolve(rustIdentityDir, entry.name);
    if (!filePath.startsWith(`${rustIdentityDir}${path.sep}`)) continue;
    fs.rmSync(filePath, { force: true });
    removed.push(filePath);
  }
  return removed.sort();
}

function combineWipeKinds(first: WipeKind, second: WipeKind): WipeKind {
  if (first === second) return first;
  if (first === "map_and_blueprints" || second === "map_and_blueprints") return "map_and_blueprints";
  return "map_and_blueprints";
}

function combineSeedMode(
  officialMode: WipeSeedMode,
  officialSeed: number | null,
  customMode: WipeSeedMode,
  customSeed: number | null
): { seedMode: WipeSeedMode; seed: number | null } {
  if (customMode !== "keep") return { seedMode: customMode, seed: customSeed };
  return { seedMode: officialMode, seed: officialSeed };
}

function firstWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const first = new Date(year, month, 1, 12, 0, 0, 0);
  return 1 + ((weekday - first.getDay() + 7) % 7);
}

function zonedDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
  const parts = zonedParts(utcGuess, timeZone);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
  const offset = wallAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset);
}

function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}
