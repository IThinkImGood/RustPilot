import path from "node:path";
import { RUST_DEDICATED_SERVER_APP_ID } from "./constants.js";

export function generateSteamCmdInstallArgs(serverDirectory: string): string[] {
  return [
    "+force_install_dir",
    path.resolve(serverDirectory),
    "+login",
    "anonymous",
    "+app_update",
    RUST_DEDICATED_SERVER_APP_ID,
    "validate",
    "+quit"
  ];
}
