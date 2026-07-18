import fs from "node:fs";
import path from "node:path";
import { defaultServerSettings, resolveInside, serverSettingsSchema } from "@rustpilot/shared";
import type { ServerSettings } from "@rustpilot/shared";
import { RUST_DEDICATED_EXECUTABLE } from "./constants.js";
import { generateLaunchArguments, generateRedactedLaunchArguments } from "./launchArgs.js";
import { generateSteamCmdInstallArgs } from "./steamcmd.js";

export interface RustPilotPaths {
  dataRoot: string;
  steamCmdDir: string;
  steamCmdExe: string;
  serversRoot: string;
  profileRoot: string;
  serverDir: string;
  identityDir: string;
  backupsDir: string;
  logsDir: string;
  dbPath: string;
  configDir: string;
  rustDedicatedExe: string;
}

export function getRustPilotPaths(dataRoot: string, identity = "default", installDirectory = ""): RustPilotPaths {
  const appRoot = path.resolve(dataRoot);
  const root = path.resolve(installDirectory.trim() || dataRoot);
  const steamCmdDir = resolveInside(root, "steamcmd");
  const serversRoot = resolveInside(root, "servers");
  const profileRoot = resolveInside(serversRoot, identity);
  const serverDir = resolveInside(profileRoot, "server");
  const identityDir = resolveInside(profileRoot, "identity");
  const backupsDir = resolveInside(profileRoot, "backups");
  const logsDir = resolveInside(root, "logs");
  return {
    dataRoot: root,
    steamCmdDir,
    steamCmdExe: resolveInside(steamCmdDir, "steamcmd.exe"),
    serversRoot,
    profileRoot,
    serverDir,
    identityDir,
    backupsDir,
    logsDir,
    dbPath: resolveInside(appRoot, "app.db"),
    configDir: resolveInside(appRoot, "config"),
    rustDedicatedExe: resolveInside(serverDir, RUST_DEDICATED_EXECUTABLE)
  };
}

export function ensureRuntimeDirectories(paths: RustPilotPaths): void {
  for (const directory of [
    paths.dataRoot,
    paths.steamCmdDir,
    paths.serversRoot,
    paths.profileRoot,
    paths.serverDir,
    paths.identityDir,
    paths.backupsDir,
    paths.logsDir,
    paths.configDir
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

export class RustAdapter {
  constructor(private readonly dataRoot: string) {}

  getPaths(settings: Pick<ServerSettings, "identity"> & Partial<Pick<ServerSettings, "installDirectory">> = defaultServerSettings): RustPilotPaths {
    return getRustPilotPaths(this.dataRoot, settings.identity, settings.installDirectory ?? "");
  }

  detectSteamCmd(settings: Pick<ServerSettings, "identity"> & Partial<Pick<ServerSettings, "installDirectory">> = defaultServerSettings): boolean {
    return fs.existsSync(this.getPaths(settings).steamCmdExe);
  }

  detectServerInstallation(settings: ServerSettings): boolean {
    return fs.existsSync(this.getPaths(settings).rustDedicatedExe);
  }

  validateInstallation(settings: ServerSettings): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const parsed = serverSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      errors.push("Server configuration is invalid.");
    }
    if (!this.detectSteamCmd(settings)) {
      errors.push("SteamCMD is missing.");
    }
    if (!this.detectServerInstallation(settings)) {
      errors.push("RustDedicated.exe is missing.");
    }
    return { valid: errors.length === 0, errors };
  }

  generateLaunchArguments(settings: ServerSettings): string[] {
    return generateLaunchArguments(settings);
  }

  generateRedactedLaunchArguments(settings: ServerSettings): string[] {
    return generateRedactedLaunchArguments(settings);
  }

  generateSteamCmdInstallArgs(settings: ServerSettings): string[] {
    return generateSteamCmdInstallArgs(this.getPaths(settings).serverDir);
  }
}
