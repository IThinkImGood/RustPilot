import fs from "node:fs";
import path from "node:path";
import type { ServerSettings } from "@rustpilot/shared";
import type { RustAdapter } from "@rustpilot/rust-adapter";

export const CFG_FILES = [
  {
    name: "server.cfg",
    description: "Main server variables loaded from the server identity cfg folder."
  },
  {
    name: "users.cfg",
    description: "Owner and moderator assignments."
  },
  {
    name: "bans.cfg",
    description: "Persistent player bans."
  }
] as const;

export type CfgFileName = (typeof CFG_FILES)[number]["name"];

export const CFG_FILE_NAMES = new Set(CFG_FILES.map((file) => file.name));

export function getCfgDirectory(adapter: RustAdapter, settings: ServerSettings): string {
  const paths = adapter.getPaths(settings);
  return path.resolve(paths.serverDir, "server", settings.identity, "cfg");
}

export function getCfgPath(adapter: RustAdapter, settings: ServerSettings, fileName: string): string | null {
  if (!CFG_FILE_NAMES.has(fileName as CfgFileName)) return null;
  return path.resolve(getCfgDirectory(adapter, settings), fileName);
}

export function getDefaultCfgContent(fileName: string): string {
  if (fileName !== "users.cfg") return "";
  return [
    "// RustPilot users.cfg",
    "// Add SteamID64 values below, then restart the Rust server.",
    "// Owner has full admin access:",
    '// ownerid 76561198000000000 "PlayerName" "Owner"',
    "",
    "// Moderator has limited admin access:",
    '// moderatorid 76561198000000000 "PlayerName" "Moderator"',
    "",
    "// Keep this file in server/<identity>/cfg/users.cfg.",
    ""
  ].join("\n");
}

export function ensureDefaultCfgFiles(adapter: RustAdapter, settings: ServerSettings): void {
  const cfgDirectory = getCfgDirectory(adapter, settings);
  fs.mkdirSync(cfgDirectory, { recursive: true });
  for (const file of CFG_FILES) {
    const content = getDefaultCfgContent(file.name);
    if (!content) continue;
    const filePath = path.resolve(cfgDirectory, file.name);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, "utf8");
  }
}
