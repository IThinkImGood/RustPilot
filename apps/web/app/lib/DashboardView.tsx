"use client";
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

export function DashboardView() {
  const { status, error, loading, refresh } = useRustPilot();
  const process = status?.process;
  const setup = status?.setup;
  const settings = status?.settings;
  const rcon = status?.rcon;
  const scheduledRestart = status?.scheduledRestart;

  return (
    <ProtectedPage status={status} error={error} loading={loading} onRetry={refresh}>
      <div className="topbar">
        <h1>Dashboard</h1>
      </div>
      <div className="grid dashboard-grid">
        <section className="card">
          <h2>Runtime</h2>
          <div className="metric"><span>RustPilot</span><strong>active</strong></div>
          <div className="metric"><span>Installation</span><strong className="badge">{labelInstallationState(setup?.installationState)}</strong></div>
          <div className="metric"><span>Process</span><strong className="badge">{labelProcessState(process?.processState)}</strong></div>
          <div className="metric"><span>Uptime</span><strong>{formatUptime(process?.uptimeSeconds)}</strong></div>
          <div className="metric"><span>PID</span><strong>{value(process?.pid)}</strong></div>
        </section>
        <section className="card">
          <h2>Server</h2>
          <div className="metric"><span>Hostname</span><strong>{value(settings?.hostname)}</strong></div>
          <div className="metric"><span>Identity</span><strong>{value(settings?.identity)}</strong></div>
          <div className="metric"><span>Ports</span><strong>{settings ? `${settings.gamePort}/${settings.queryPort}/${settings.rconPort}` : "n/a"}</strong></div>
          <div className="metric"><span>RustDedicated.exe</span><strong>{setup?.rustExecutableExists ? "found" : "not found"}</strong></div>
        </section>
        <section className="card">
          <h2>WebRCON</h2>
          <div className="metric"><span>State</span><strong className="badge">{value(rcon?.state)}</strong></div>
          <div className="metric"><span>Endpoint</span><strong>{value(rcon?.endpoint)}</strong></div>
          <div className="metric"><span>Connected</span><strong>{formatLocalDateTime(rcon?.connectedAt)}</strong></div>
          <div className="metric"><span>Last error</span><strong>{value(rcon?.lastError)}</strong></div>
        </section>
        <section className="card">
          <h2>Latest Status</h2>
          <div className="metric"><span>Last start</span><strong>{formatLocalDateTime(process?.startedAt)}</strong></div>
          <div className="metric"><span>Last stop</span><strong>{formatLocalDateTime(process?.stoppedAt)}</strong></div>
          <div className="metric"><span>Exit code</span><strong>{value(process?.lastExitCode)}</strong></div>
          <div className="metric"><span>Crash</span><strong>{formatLocalDateTime(process?.lastCrashAt)}</strong></div>
        </section>
        <section className="card">
          <h2>Scheduled Restart</h2>
          <div className="metric"><span>Scheduled</span><strong>{scheduledRestart?.scheduled ? "yes" : "no"}</strong></div>
          <div className="metric"><span>Run at</span><strong>{formatLocalDateTime(scheduledRestart?.runAt)}</strong></div>
          <div className="metric"><span>Reason</span><strong>{value(scheduledRestart?.reason)}</strong></div>
        </section>
        <section className="card">
          <h2>Paths</h2>
          <PathMetric label="Install directory" value={status?.paths?.installDir} />
          <PathMetric label="Data" value={status?.paths?.dataRoot} />
        </section>
      </div>
    </ProtectedPage>
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
