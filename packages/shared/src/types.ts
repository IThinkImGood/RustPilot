export type InstallationState =
  | "not_configured"
  | "ready_for_install"
  | "downloading_steamcmd"
  | "extracting_steamcmd"
  | "installing_server"
  | "updating_server"
  | "installed"
  | "install_failed"
  | "update_failed";

export type ProcessState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "restarting"
  | "crashed";

export type ConsoleSource = "rustpilot" | "steamcmd" | "rust-server";
export type ConsoleStream = "stdout" | "stderr" | "system" | "input";
export type ConsoleLevel = "debug" | "info" | "warn" | "error";

export interface ConsoleEvent {
  id: number;
  timestamp: string;
  source: ConsoleSource;
  stream: ConsoleStream;
  level: ConsoleLevel;
  message: string;
}

export interface ServerRuntimeStatus {
  processState: ProcessState;
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  uptimeSeconds: number;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastCrashAt: string | null;
}

export interface SetupStatus {
  completed: boolean;
  setupCompleted?: boolean;
  persistedSetupCompleted?: boolean;
  installationState: InstallationState;
  steamCmdInstalled: boolean;
  serverInstalled: boolean;
  rustServerInstalled?: boolean;
  configurationValid?: boolean;
  rustExecutableExists?: boolean;
  requiredAction?: string;
  message?: string | null;
  configured: boolean;
  installError: string | null;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
