import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { UsageHistoryPoint, UsageMetrics, ProcessUsageSample } from "@rustpilot/shared";
import type { ServerProcessManager } from "./serverProcessManager.js";

const execFileAsync = promisify(execFile);
const SAMPLE_INTERVAL_MS = 2000;
const MAX_HISTORY_POINTS = 90;

interface ProcessSnapshot {
  cpuPercent: number | null;
  memoryRssBytes: number | null;
  cpuTimeSeconds?: number;
}

export class MetricsCollector {
  private timer: ReturnType<typeof setInterval> | null = null;
  private collecting = false;
  private lastRustPilotCpu = process.cpuUsage();
  private lastRustPilotAt = performance.now();
  private lastPidSnapshots = new Map<number, { at: number; cpuTimeSeconds: number }>();
  private snapshot: UsageMetrics = createEmptyMetrics();

  constructor(private readonly processManager: ServerProcessManager) {}

  start(): void {
    if (this.timer) return;
    void this.collect();
    this.timer = setInterval(() => void this.collect(), SAMPLE_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getSnapshot(): UsageMetrics {
    return this.snapshot;
  }

  private async collect(): Promise<void> {
    if (this.collecting) return;
    this.collecting = true;
    try {
      const now = new Date();
      const rustPilot = this.collectRustPilotUsage();
      const serverPid = this.processManager.getStatus().pid;
      const rustServer = serverPid ? await this.collectExternalProcessUsage(serverPid, "RustDedicated.exe") : emptyProcess("RustDedicated.exe", null);
      const point: UsageHistoryPoint = {
        timestamp: now.toISOString(),
        rustPilotCpuPercent: rustPilot.cpuPercent,
        rustPilotMemoryRssBytes: rustPilot.memoryRssBytes,
        rustServerCpuPercent: rustServer.cpuPercent,
        rustServerMemoryRssBytes: rustServer.memoryRssBytes
      };
      this.snapshot = {
        sampledAt: point.timestamp,
        cpuCount: Math.max(1, os.cpus().length),
        rustPilot,
        rustServer,
        history: [...this.snapshot.history.slice(-(MAX_HISTORY_POINTS - 1)), point]
      };
    } finally {
      this.collecting = false;
    }
  }

  private collectRustPilotUsage(): ProcessUsageSample {
    const now = performance.now();
    const usage = process.cpuUsage();
    const cpuDeltaUs = usage.user + usage.system - this.lastRustPilotCpu.user - this.lastRustPilotCpu.system;
    const elapsedUs = Math.max(1, (now - this.lastRustPilotAt) * 1000);
    this.lastRustPilotCpu = usage;
    this.lastRustPilotAt = now;
    return {
      name: "RustPilot",
      pid: process.pid,
      cpuPercent: clampPercent((cpuDeltaUs / elapsedUs / Math.max(1, os.cpus().length)) * 100),
      memoryRssBytes: process.memoryUsage().rss
    };
  }

  private async collectExternalProcessUsage(pid: number, name: string): Promise<ProcessUsageSample> {
    const snapshot = process.platform === "win32" ? await readWindowsProcess(pid) : await this.readProcfsProcess(pid);
    return {
      name,
      pid,
      cpuPercent: snapshot.cpuPercent,
      memoryRssBytes: snapshot.memoryRssBytes
    };
  }

  private async readProcfsProcess(pid: number): Promise<ProcessSnapshot> {
    try {
      const fs = await import("node:fs/promises");
      const [stat, statm] = await Promise.all([fs.readFile(`/proc/${pid}/stat`, "utf8"), fs.readFile(`/proc/${pid}/statm`, "utf8")]);
      const statParts = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      const utime = Number(statParts[11]);
      const stime = Number(statParts[12]);
      const cpuTimeSeconds = (utime + stime) / 100;
      const rssPages = Number(statm.trim().split(/\s+/)[1]);
      const memoryRssBytes = Number.isFinite(rssPages) ? rssPages * 4096 : null;
      const cpuPercent = this.computeExternalCpuPercent(pid, cpuTimeSeconds);
      return { cpuPercent, memoryRssBytes, cpuTimeSeconds };
    } catch {
      this.lastPidSnapshots.delete(pid);
      return { cpuPercent: null, memoryRssBytes: null };
    }
  }

  private computeExternalCpuPercent(pid: number, cpuTimeSeconds: number): number | null {
    const now = performance.now();
    const previous = this.lastPidSnapshots.get(pid);
    this.lastPidSnapshots.set(pid, { at: now, cpuTimeSeconds });
    if (!previous) return null;
    const elapsedSeconds = Math.max(0.001, (now - previous.at) / 1000);
    return clampPercent(((cpuTimeSeconds - previous.cpuTimeSeconds) / elapsedSeconds / Math.max(1, os.cpus().length)) * 100);
  }
}

async function readWindowsProcess(pid: number): Promise<ProcessSnapshot> {
  try {
    const script = [
      `$process = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { [int]$_.IDProcess -eq ${pid} } | Select-Object -First 1 IDProcess,PercentProcessorTime,WorkingSet`,
      "if ($null -eq $process) { exit 3 }",
      "$process | ConvertTo-Json -Compress"
    ].join("; ");
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      timeout: 2500,
      windowsHide: true
    });
    const parsed = JSON.parse(stdout.trim()) as { PercentProcessorTime?: number; WorkingSet?: number };
    return {
      cpuPercent: clampPercent((Number(parsed.PercentProcessorTime) || 0) / Math.max(1, os.cpus().length)),
      memoryRssBytes: Number.isFinite(Number(parsed.WorkingSet)) ? Number(parsed.WorkingSet) : null
    };
  } catch {
    return { cpuPercent: null, memoryRssBytes: null };
  }
}

function createEmptyMetrics(): UsageMetrics {
  return {
    sampledAt: null,
    cpuCount: Math.max(1, os.cpus().length),
    rustPilot: emptyProcess("RustPilot", process.pid),
    rustServer: emptyProcess("RustDedicated.exe", null),
    history: []
  };
}

function emptyProcess(name: string, pid: number | null): ProcessUsageSample {
  return { name, pid, cpuPercent: null, memoryRssBytes: null };
}

function clampPercent(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Number(value.toFixed(1))));
}
