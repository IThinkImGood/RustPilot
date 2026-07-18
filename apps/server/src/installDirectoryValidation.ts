import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RustAdapter } from "@rustpilot/rust-adapter";
import type { ServerSettings } from "@rustpilot/shared";

export type InstallDirectoryChoice = "new" | "use-existing" | "repair";

export interface InstallDirectoryValidation {
  valid: boolean;
  canInstall: boolean;
  exists: boolean;
  empty: boolean;
  writable: boolean;
  canCreate: boolean;
  isDirectory: boolean;
  safePath: boolean;
  recognizedRustPilotInstallation: boolean;
  requiresChoice: boolean;
  choiceAccepted: boolean;
  lowDiskSpace: boolean;
  freeBytes: number | null;
  warnings: string[];
  errors: string[];
  installRoot: string;
  directoriesToCreate: string[];
}

const MIN_FREE_BYTES_WARNING = 15 * 1024 * 1024 * 1024;
const WINDOWS_INVALID_CHARS = /[<>:"|?*]/;

function isSubPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function directoryEntries(directory: string): string[] {
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

function hasWritableAccess(directory: string): boolean {
  const probe = path.join(directory, `.rustpilot-write-test-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probe, "ok", { flag: "wx" });
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

function getFreeBytes(directory: string): number | null {
  try {
    const statfs = fs.statfsSync(directory);
    return Number(statfs.bavail) * Number(statfs.bsize);
  } catch {
    return null;
  }
}

function hasKnownRustServerContent(serverDir: string, rustExe: string): boolean {
  if (fs.existsSync(rustExe)) return true;
  const entries = directoryEntries(serverDir).map((entry) => entry.toLowerCase());
  return entries.some((entry) => ["rustdedicated_data", "steamapps", "bundles", "cfg"].includes(entry));
}

export function validateInstallDirectory(
  adapter: RustAdapter,
  settings: ServerSettings,
  choice: InstallDirectoryChoice | null = null
): InstallDirectoryValidation {
  const paths = adapter.getPaths(settings);
  const installRoot = paths.dataRoot;
  const directoriesToCreate = [
    paths.steamCmdDir,
    paths.serverDir,
    paths.identityDir,
    paths.backupsDir,
    paths.logsDir
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  const requestedInstallDirectory = settings.installDirectory.trim();
  const parsedRoot = path.parse(installRoot).root;
  const pathWithoutRoot = installRoot.slice(parsedRoot.length);
  const invalidPath = pathWithoutRoot.split(path.sep).some((segment) => WINDOWS_INVALID_CHARS.test(segment));
  const hasTraversal = requestedInstallDirectory
    .split(/[\\/]+/)
    .some((segment) => segment === "..");
  const customPathIsAbsolute = !requestedInstallDirectory || path.isAbsolute(requestedInstallDirectory);
  const safePath =
    !invalidPath &&
    !hasTraversal &&
    customPathIsAbsolute &&
    !settings.identity.includes("..") &&
    directoriesToCreate.every((directory) => isSubPath(installRoot, directory));

  if (!safePath) {
    if (!customPathIsAbsolute) {
      errors.push("Use an absolute install path, for example D:\\RustServers\\MyServer.");
    } else {
      errors.push("The install path contains invalid or unsafe segments.");
    }
  }

  let exists = fs.existsSync(installRoot);
  let isDirectory = false;
  let canCreate = exists;
  if (exists) {
    try {
      isDirectory = fs.statSync(installRoot).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) errors.push("The install path points to a file, not a directory.");
  } else if (safePath) {
    try {
      fs.mkdirSync(installRoot, { recursive: true });
      exists = true;
      isDirectory = true;
      canCreate = true;
    } catch {
      canCreate = false;
      errors.push("The install directory cannot be created.");
    }
  } else {
    canCreate = false;
  }

  const writable = exists && isDirectory ? hasWritableAccess(installRoot) : false;
  if (exists && isDirectory && !writable) {
    errors.push("RustPilot does not have write access to the install directory.");
  }

  const rootEntries = exists && isDirectory ? directoryEntries(installRoot) : [];
  const empty = rootEntries.length === 0;
  const serverDirExists = fs.existsSync(paths.serverDir);
  const serverDirIsDirectory = serverDirExists ? fs.statSync(paths.serverDir).isDirectory() : true;
  if (!serverDirIsDirectory) {
    errors.push("The server install path points to a file, not a directory.");
  }
  const serverEntries = serverDirExists && serverDirIsDirectory ? directoryEntries(paths.serverDir) : [];
  const serverDirEmpty = serverEntries.length === 0;
  const recognizedRustPilotInstallation =
    fs.existsSync(paths.steamCmdExe) || hasKnownRustServerContent(paths.serverDir, paths.rustDedicatedExe);

  if (!empty && serverDirExists && serverDirIsDirectory && !serverDirEmpty && !recognizedRustPilotInstallation) {
    errors.push("The selected server folder already contains files and does not look like a RustPilot installation.");
  }

  const requiresChoice = recognizedRustPilotInstallation;
  const choiceAccepted = !requiresChoice || choice === "use-existing" || choice === "repair";
  if (requiresChoice && !choiceAccepted) {
    errors.push("Choose whether to use the existing installation, repair it, or cancel.");
  }

  let freeBytes = exists && isDirectory ? getFreeBytes(installRoot) : null;
  if (freeBytes === null) {
    freeBytes = getFreeBytes(path.parse(installRoot).root || os.tmpdir());
  }
  const lowDiskSpace = freeBytes !== null && freeBytes < MIN_FREE_BYTES_WARNING;
  if (lowDiskSpace) {
    warnings.push("Free disk space is low. Rust Dedicated Server can use several gigabytes.");
  }

  return {
    valid: errors.length === 0,
    canInstall: errors.length === 0,
    exists,
    empty,
    writable,
    canCreate,
    isDirectory,
    safePath,
    recognizedRustPilotInstallation,
    requiresChoice,
    choiceAccepted,
    lowDiskSpace,
    freeBytes,
    warnings,
    errors,
    installRoot,
    directoriesToCreate
  };
}
