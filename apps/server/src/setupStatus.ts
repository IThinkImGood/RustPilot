import { serverSettingsSchema, type SetupStatus } from "@rustpilot/shared";
import type { RustAdapter } from "@rustpilot/rust-adapter";
import type { Storage } from "./storage.js";

export type SetupRequiredAction =
  | "configure_server"
  | "install_steamcmd"
  | "install_rust_server"
  | "complete_setup"
  | "none";

export interface ComputedSetupStatus extends SetupStatus {
  setupCompleted: boolean;
  persistedSetupCompleted: boolean;
  rustServerInstalled: boolean;
  configurationValid: boolean;
  rustExecutableExists: boolean;
  requiredAction: SetupRequiredAction;
  message: string | null;
}

export function computeSetupStatus(storage: Storage, adapter: RustAdapter): ComputedSetupStatus {
  const runtime = storage.getRuntimeSetup();
  const settingsRow = storage.getSettingsRecord();
  const settings = settingsRow.settings;
  const configurationValid = settingsRow.exists && serverSettingsSchema.safeParse(settings).success;
  const steamCmdInstalled = configurationValid ? adapter.detectSteamCmd(settings) : false;
  const rustExecutableExists = configurationValid ? adapter.detectServerInstallation(settings) : false;
  const rustServerInstalled = rustExecutableExists;
  let requiredAction: SetupRequiredAction = "none";
  let message: string | null = null;

  if (!configurationValid) {
    requiredAction = "configure_server";
    message = "No valid server configuration has been saved yet.";
  } else if (!steamCmdInstalled) {
    requiredAction = "install_steamcmd";
    message = "SteamCMD is missing or could not be found.";
  } else if (!rustServerInstalled || !rustExecutableExists) {
    requiredAction = "install_rust_server";
    message = "RustDedicated.exe is missing. The installation is incomplete or damaged.";
  } else if (!runtime.setupCompleted) {
    requiredAction = "complete_setup";
    message = "Installation and configuration exist, but setup has not been marked complete yet.";
  }

  const setupCompleted =
    runtime.setupCompleted && configurationValid && steamCmdInstalled && rustServerInstalled && rustExecutableExists;
  let installationState = runtime.installationState;

  if (runtime.setupCompleted && !setupCompleted) {
    storage.setSetupCompleted(false);
    if (runtime.installationState === "installed") {
      storage.setInstallationState("ready_for_install", message);
      installationState = "ready_for_install";
    }
  }

  return {
    completed: setupCompleted,
    setupCompleted,
    persistedSetupCompleted: runtime.setupCompleted,
    installationState,
    steamCmdInstalled,
    serverInstalled: rustServerInstalled,
    rustServerInstalled,
    configurationValid,
    rustExecutableExists,
    configured: settingsRow.exists,
    requiredAction,
    message,
    installError: runtime.installError
  };
}
