export interface DashboardActionStateInput {
  setupCompleted: boolean;
  installationState?: string;
  processState?: string;
  installRunning?: boolean;
}

export function getDashboardActionStates(input: DashboardActionStateInput) {
  const installed = input.setupCompleted && input.installationState === "installed";
  const processState = input.processState ?? "stopped";
  const busy =
    Boolean(input.installRunning) ||
    processState === "starting" ||
    processState === "stopping" ||
    processState === "restarting";

  return {
    install: !input.installRunning && !input.setupCompleted,
    update: installed && processState === "stopped" && !busy,
    start: installed && processState === "stopped" && !busy,
    stop: installed && (processState === "starting" || processState === "running") && !input.installRunning,
    restart: installed && processState === "running" && !busy
  };
}
