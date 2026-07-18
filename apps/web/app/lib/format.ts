const processLabels: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  restarting: "Restarting",
  crashed: "Crashed"
};

const installationLabels: Record<string, string> = {
  not_configured: "Not configured",
  ready_for_install: "Ready to install",
  downloading_steamcmd: "Downloading SteamCMD",
  extracting_steamcmd: "Extracting SteamCMD",
  installing_server: "Installing server",
  updating_server: "Updating server",
  installed: "Installed",
  install_failed: "Install failed",
  update_failed: "Update failed"
};

export function formatUptime(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return "n/a";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d${hours > 0 ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return `${Math.max(1, minutes)} min`;
}

export function formatLocalDateTime(value: string | null | undefined): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "medium"
  }).format(date);
}

export function labelProcessState(value: string | null | undefined): string {
  return value ? processLabels[value] ?? value : "n/a";
}

export function labelInstallationState(value: string | null | undefined): string {
  return value ? installationLabels[value] ?? value : "n/a";
}

export function shortenPath(value: string, max = 48): string {
  if (value.length <= max) return value;
  const normalized = value.replaceAll("/", "\\");
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length >= 3) {
    const tail = parts.slice(-3).join("\\");
    return `...\\${tail}`;
  }
  return `${value.slice(0, Math.max(0, max - 1))}...`;
}
