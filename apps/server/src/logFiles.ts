import fs from "node:fs";
import path from "node:path";
import type { LogFileContent, LogFileSummary } from "@rustpilot/shared";

const LOG_FILE_PATTERN = /^[A-Za-z0-9._-]+\.log$/;
const MAX_LOG_READ_BYTES = 512 * 1024;

export function listLogFiles(logsDir: string): LogFileSummary[] {
  const root = path.resolve(logsDir);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LOG_FILE_PATTERN.test(entry.name))
    .map((entry) => summarizeLogFile(path.resolve(root, entry.name)))
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

export function readLogFile(logsDir: string, fileName: string): LogFileContent | null {
  if (!LOG_FILE_PATTERN.test(fileName) || path.basename(fileName) !== fileName) return null;
  const root = path.resolve(logsDir);
  const filePath = path.resolve(root, fileName);
  if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const readBytes = Math.min(stat.size, MAX_LOG_READ_BYTES);
  const buffer = Buffer.alloc(readBytes);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, readBytes, Math.max(0, stat.size - readBytes));
  } finally {
    fs.closeSync(fd);
  }
  return {
    file: summarizeLogFile(filePath),
    content: buffer.toString("utf8"),
    truncated: stat.size > MAX_LOG_READ_BYTES,
    maxBytes: MAX_LOG_READ_BYTES
  };
}

function summarizeLogFile(filePath: string): LogFileSummary {
  const stat = fs.statSync(filePath);
  return {
    fileName: path.basename(filePath),
    path: filePath,
    modifiedAt: stat.mtime.toISOString(),
    sizeBytes: stat.size
  };
}
