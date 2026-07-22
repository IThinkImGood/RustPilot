import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import type { RustAdapter } from "@rustpilot/rust-adapter";
import type { BackupSummary, ServerSettings } from "@rustpilot/shared";

const BACKUP_PREFIX = "rustpilot-backup";
const BACKUP_PATTERN = /^rustpilot-backup-(.+)-(\d{8}T\d{6}Z)(?:-\d+)?\.zip$/;
const BACKUP_FILE_NAME_PATTERN = /^rustpilot-backup-[A-Za-z0-9._-]+-\d{8}T\d{6}Z(?:-\d+)?\.zip$/;

function safeFileSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "default";
}

function backupTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseBackupCreatedAt(fileName: string, fallback: Date): string {
  const match = BACKUP_PATTERN.exec(fileName);
  if (!match) return fallback.toISOString();
  const value = match[2]!;
  const parsed = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
  );
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function summarizeBackup(filePath: string, defaultIdentity: string): BackupSummary {
  const fileName = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const match = BACKUP_PATTERN.exec(fileName);
  return {
    fileName,
    path: filePath,
    createdAt: parseBackupCreatedAt(fileName, stat.mtime),
    sizeBytes: stat.size,
    identity: match?.[1] ?? defaultIdentity
  };
}

export function listManualBackups(adapter: RustAdapter, settings: ServerSettings): BackupSummary[] {
  const paths = adapter.getPaths(settings);
  if (!fs.existsSync(paths.backupsDir)) return [];
  return fs
    .readdirSync(paths.backupsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${BACKUP_PREFIX}-`) && entry.name.endsWith(".zip"))
    .map((entry) => summarizeBackup(path.resolve(paths.backupsDir, entry.name), settings.identity))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function createManualBackup(adapter: RustAdapter, settings: ServerSettings): BackupSummary {
  const paths = adapter.getPaths(settings);
  fs.mkdirSync(paths.backupsDir, { recursive: true });

  const createdAt = new Date();
  const baseFileName = `${BACKUP_PREFIX}-${safeFileSegment(settings.identity)}-${backupTimestamp(createdAt)}`;
  let fileName = `${baseFileName}.zip`;
  let backupPath = path.resolve(paths.backupsDir, fileName);
  for (let index = 2; fs.existsSync(backupPath); index += 1) {
    fileName = `${baseFileName}-${index}.zip`;
    backupPath = path.resolve(paths.backupsDir, fileName);
  }
  const rustIdentityDir = path.resolve(paths.serverDir, "server", settings.identity);
  const legacyIdentityDir = paths.identityDir;
  const zip = new AdmZip();

  if (fs.existsSync(rustIdentityDir)) {
    zip.addLocalFolder(rustIdentityDir, `server/${settings.identity}`);
  }
  if (fs.existsSync(legacyIdentityDir)) {
    zip.addLocalFolder(legacyIdentityDir, "identity");
  }
  zip.addFile(
    "rustpilot-backup.json",
    Buffer.from(
      JSON.stringify(
        {
          createdAt: createdAt.toISOString(),
          identity: settings.identity,
          hostname: settings.hostname,
          includes: {
            rustIdentity: fs.existsSync(rustIdentityDir),
            managedIdentity: fs.existsSync(legacyIdentityDir)
          }
        },
        null,
        2
      ),
      "utf8"
    )
  );
  zip.writeZip(backupPath);
  return summarizeBackup(backupPath, settings.identity);
}

export function deleteManualBackup(adapter: RustAdapter, settings: ServerSettings, fileName: string): BackupSummary | null {
  if (!BACKUP_FILE_NAME_PATTERN.test(fileName) || path.basename(fileName) !== fileName) return null;
  const paths = adapter.getPaths(settings);
  const backupsDir = path.resolve(paths.backupsDir);
  const backupPath = path.resolve(backupsDir, fileName);
  if (!backupPath.startsWith(`${backupsDir}${path.sep}`) || !fs.existsSync(backupPath)) return null;
  const summary = summarizeBackup(backupPath, settings.identity);
  fs.rmSync(backupPath, { force: true });
  return summary;
}
