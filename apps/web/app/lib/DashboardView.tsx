"use client";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faHardDrive, faMicrochip, faPlug, faServer, faSignal } from "@fortawesome/free-solid-svg-icons";
import { useRustPilot } from "./useRustPilot";
import { ProtectedPage } from "./ProtectedPage";
import {
  formatLocalDateTime,
  formatUptime,
  labelInstallationState,
  labelProcessState,
  shortenPath
} from "./format";

function value(v: unknown) {
  return v === null || v === undefined || v === "" ? "n/a" : String(v);
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "n/a";
}

function formatBytes(value: number | null | undefined) {
  if (typeof value !== "number") return "n/a";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export function DashboardView() {
  const { status, error, loading, refresh } = useRustPilot();
  const process = status?.process;
  const setup = status?.setup;
  const settings = status?.settings;
  const rcon = status?.rcon;
  const metrics = status?.metrics;
  const isRunning = process?.processState === "running";
  const rconConnected = rcon?.state === "connected";

  return (
    <ProtectedPage status={status} error={error} loading={loading} onRetry={refresh}>
      <div className="dashboard-overview">
        <section className="card dashboard-live-card">
          <div className="dashboard-card-heading">
            <span>Server stats</span>
            <FontAwesomeIcon icon={faSignal} />
          </div>
          <div className={`dashboard-state ${isRunning ? "online" : "offline"}`}>
            <strong>{labelProcessState(process?.processState)}</strong>
            <span>{isRunning ? "RustDedicated.exe is online" : "RustDedicated.exe is not running"}</span>
          </div>
          <div className="dashboard-stat-list">
            <StatRow icon={faClock} label="Uptime" value={formatUptime(process?.uptimeSeconds)} />
            <StatRow icon={faServer} label="PID" value={value(process?.pid)} />
            <StatRow icon={faHardDrive} label="Installation" value={labelInstallationState(setup?.installationState)} />
          </div>
        </section>

        <section className="card dashboard-config-card">
          <div className="dashboard-card-heading">
            <span>Server config</span>
            <FontAwesomeIcon icon={faServer} />
          </div>
          <div className="metric"><span>Hostname</span><strong>{value(settings?.hostname)}</strong></div>
          <div className="metric"><span>Identity</span><strong>{value(settings?.identity)}</strong></div>
          <div className="metric"><span>Max players</span><strong>{value(settings?.maxPlayers)}</strong></div>
          <div className="metric"><span>World</span><strong>{settings ? `${settings.worldSize} / ${settings.seed}` : "n/a"}</strong></div>
          <div className="metric"><span>Ports</span><strong>{settings ? `${settings.gamePort}/${settings.queryPort}/${settings.rconPort}` : "n/a"}</strong></div>
        </section>

        <section className="card dashboard-usage-card">
          <div className="dashboard-card-heading">
            <span>Live usage</span>
            <FontAwesomeIcon icon={faMicrochip} />
          </div>
          <div className="usage-meter-grid">
            <UsageMeter label="Rust server CPU" value={metrics?.rustServer.cpuPercent} kind="cpu" />
            <UsageMeter label="Rust server RAM" value={metrics?.rustServer.memoryRssBytes} kind="memory" />
            <UsageMeter label="RustPilot CPU" value={metrics?.rustPilot.cpuPercent} kind="cpu" />
            <UsageMeter label="RustPilot RAM" value={metrics?.rustPilot.memoryRssBytes} kind="memory" />
          </div>
        </section>

        <section className="card dashboard-rcon-card">
          <div className="dashboard-card-heading">
            <span>WebRCON</span>
            <FontAwesomeIcon icon={faPlug} />
          </div>
          <div className={`dashboard-rcon-state ${rconConnected ? "online" : "offline"}`}>
            <strong>{rconConnected ? "Connected" : value(rcon?.state)}</strong>
            <span>{rconConnected ? "Ready for player actions" : value(rcon?.lastError)}</span>
          </div>
          <div className="metric"><span>State</span><strong className="badge">{value(rcon?.state)}</strong></div>
          <div className="metric"><span>Connected</span><strong>{formatLocalDateTime(rcon?.connectedAt)}</strong></div>
          <div className="metric"><span>Pending</span><strong>{value(rcon?.pendingCommands)}</strong></div>
        </section>

        <section className="card dashboard-activity-card">
          <div className="dashboard-card-heading">
            <span>Server activity</span>
            <FontAwesomeIcon icon={faClock} />
          </div>
          <div className="dashboard-activity-graph" aria-hidden="true">
            {(metrics?.history.length ? metrics.history.slice(-36) : [null]).map((point, index) => {
              const cpu = Math.max(point?.rustServerCpuPercent ?? 0, point?.rustPilotCpuPercent ?? 0);
              const memory = Math.max(point?.rustServerMemoryRssBytes ?? 0, point?.rustPilotMemoryRssBytes ?? 0);
              const memoryGbHeight = Math.min(100, (memory / 1024 ** 3) * 18);
              const height = Math.max(8, Math.min(100, cpu * 2 + memoryGbHeight));
              return <span className={point ? "active" : ""} style={{ height: `${height}%` }} key={point?.timestamp ?? index} />;
            })}
          </div>
          <div className="dashboard-activity-details">
            <div><span>Last start</span><strong>{formatLocalDateTime(process?.startedAt)}</strong></div>
            <div><span>Last stop</span><strong>{formatLocalDateTime(process?.stoppedAt)}</strong></div>
            <div><span>Exit code</span><strong>{value(process?.lastExitCode)}</strong></div>
            <div><span>Crash</span><strong>{formatLocalDateTime(process?.lastCrashAt)}</strong></div>
          </div>
        </section>

        <section className="card dashboard-paths-bar">
          <span className="dashboard-paths-title">
            <FontAwesomeIcon icon={faHardDrive} />
            Paths
          </span>
          <PathMetric label="Install directory" value={status?.paths?.installDir} />
          <PathMetric label="Data" value={status?.paths?.dataRoot} />
        </section>
      </div>
    </ProtectedPage>
  );
}

function UsageMeter({ label, value, kind }: { label: string; value: number | null | undefined; kind: "cpu" | "memory" }) {
  const percent = kind === "cpu" ? Math.max(0, Math.min(100, value ?? 0)) : Math.max(0, Math.min(100, ((value ?? 0) / 1024 ** 3) * 12.5));
  return (
    <div className="usage-meter">
      <div>
        <span>{label}</span>
        <strong>{kind === "cpu" ? formatPercent(value) : formatBytes(value)}</strong>
      </div>
      <div className="usage-meter-track">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: IconDefinition; label: string; value: string }) {
  return (
    <div className="dashboard-stat-row">
      <FontAwesomeIcon icon={icon} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PathMetric({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return <div className="metric"><span>{label}</span><strong>n/a</strong></div>;
  }
  async function copy() {
    await navigator.clipboard?.writeText(value ?? "");
  }
  return (
    <div className="metric path-metric">
      <span>{label}</span>
      <span className="path-value" title={value}>{shortenPath(value)}</span>
      <button className="icon-button" onClick={copy} title="Copy path">Copy</button>
    </div>
  );
}
