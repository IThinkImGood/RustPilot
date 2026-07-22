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

export type RconConnectionState = "disabled" | "disconnected" | "connecting" | "connected" | "error";

export interface RconStatus {
  state: RconConnectionState;
  endpoint: string | null;
  connectedAt: string | null;
  lastError: string | null;
  pendingCommands: number;
}

export interface RconCommandResponse {
  command: string;
  message: string;
  identifier: number;
  type: string | null;
  durationMs: number;
}

export interface ScheduledRestartStatus {
  scheduled: boolean;
  runAt: string | null;
  reason: string | null;
  kind?: "none" | "one_time" | "daily";
  schedule?: RestartScheduleConfig;
}

export interface RestartScheduleConfig {
  enabled: boolean;
  times: string[];
  reason: string | null;
}

export interface ProcessUsageSample {
  name: string;
  pid: number | null;
  cpuPercent: number | null;
  memoryRssBytes: number | null;
}

export interface UsageHistoryPoint {
  timestamp: string;
  rustPilotCpuPercent: number | null;
  rustPilotMemoryRssBytes: number | null;
  rustServerCpuPercent: number | null;
  rustServerMemoryRssBytes: number | null;
}

export interface UsageMetrics {
  sampledAt: string | null;
  cpuCount: number;
  rustPilot: ProcessUsageSample;
  rustServer: ProcessUsageSample;
  history: UsageHistoryPoint[];
}

export interface BackupSummary {
  fileName: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  identity: string;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  times: string[];
  retentionCount: number;
}

export interface BackupScheduleStatus {
  scheduled: boolean;
  runAt: string | null;
  schedule: BackupScheduleConfig;
  lastBackupAt: string | null;
  lastBackupFileName: string | null;
  lastError: string | null;
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
