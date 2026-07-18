import type { InstallationState, ProcessState } from "./types.js";

const installationTransitions: Record<InstallationState, InstallationState[]> = {
  not_configured: ["ready_for_install"],
  ready_for_install: ["downloading_steamcmd", "installing_server"],
  downloading_steamcmd: ["extracting_steamcmd", "install_failed"],
  extracting_steamcmd: ["installing_server", "install_failed"],
  installing_server: ["installed", "install_failed"],
  updating_server: ["installed", "update_failed"],
  installed: ["updating_server", "installing_server"],
  install_failed: ["ready_for_install", "downloading_steamcmd", "installing_server"],
  update_failed: ["installed", "updating_server"]
};

const processTransitions: Record<ProcessState, ProcessState[]> = {
  stopped: ["starting"],
  starting: ["running", "stopped", "crashed"],
  running: ["stopping", "restarting", "crashed"],
  stopping: ["stopped", "crashed"],
  restarting: ["stopping", "starting", "running", "stopped", "crashed"],
  crashed: ["starting", "stopped"]
};

export function canTransitionInstallation(from: InstallationState, to: InstallationState): boolean {
  return installationTransitions[from].includes(to);
}

export function canTransitionProcess(from: ProcessState, to: ProcessState): boolean {
  return processTransitions[from].includes(to);
}
