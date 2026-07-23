"use client";
import { useEffect, useMemo, useState } from "react";
import type { ConsoleEvent, LogFileContent, LogFileSummary } from "@rustpilot/shared/browser";
import { api } from "../lib/api";
import { shortenPath } from "../lib/format";
import { ProtectedPage } from "../lib/ProtectedPage";
import { useRustPilot } from "../lib/useRustPilot";

type LogMode = "live" | "log";
type FilterKey = "rustpilot" | "steamcmd" | "server" | "commands" | "warnings" | "players" | "chat";

interface LogLine {
  id: string;
  text: string;
  timestamp: string | null;
  categories: FilterKey[];
}

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: "rustpilot", label: "RustPilot" },
  { key: "steamcmd", label: "SteamCMD" },
  { key: "server", label: "Rust server" },
  { key: "commands", label: "Commands" },
  { key: "warnings", label: "Warnings/errors" },
  { key: "players", label: "Player activity" },
  { key: "chat", label: "Chat" }
];

const initialFilters: Record<FilterKey, boolean> = filters.reduce(
  (accumulator, filter) => ({ ...accumulator, [filter.key]: true }),
  {} as Record<FilterKey, boolean>
);

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(2)} MB`;
}

function formatTime(value: string | null): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function categorizeLine(text: string, event?: ConsoleEvent): FilterKey[] {
  const categories = new Set<FilterKey>();
  const source = event?.source ?? (/\[SteamCMD\]/i.test(text) ? "steamcmd" : /\[Server\]/i.test(text) ? "rust-server" : "rustpilot");
  if (source === "rustpilot") categories.add("rustpilot");
  if (source === "steamcmd") categories.add("steamcmd");
  if (source === "rust-server") categories.add("server");
  if (event?.stream === "input" || /\[(server|rust server)\].*?\b(server\.|global\.|chat\.|quit|save|status)\b/i.test(text)) categories.add("commands");
  if (event?.level === "warn" || event?.level === "error" || /\b(error|warn|failed|crash|timeout|refused|exception|stderr)\b/i.test(text)) categories.add("warnings");
  if (/\b(joined|connected|disconnected|kicked|banned|unbanned)\b/i.test(text)) categories.add("players");
  if (/\b(said|chat|say)\b/i.test(text)) categories.add("chat");
  return Array.from(categories);
}

function lineFromEvent(event: ConsoleEvent): LogLine {
  const source = event.source.replace("-", " ");
  const text = `[${formatTime(event.timestamp)}] [${source}] ${event.message}`;
  return {
    id: `event-${event.id}`,
    text,
    timestamp: event.timestamp,
    categories: categorizeLine(text, event)
  };
}

function lineFromDisk(raw: string, index: number): LogLine {
  const trimmed = raw.trimEnd();
  const match = trimmed.match(/^(.+?),\s+(\d{2}:\d{2}:\d{2})(?:\s+(.*))?$/);
  const text = match ? `[${match[2]}] ${match[3] ?? ""}` : trimmed;
  return {
    id: `disk-${index}`,
    text,
    timestamp: null,
    categories: categorizeLine(text)
  };
}

function highlightLine(line: string) {
  const parts = line.split(/(\[[^\]]+\])/g).filter(Boolean);
  return parts.map((part, index) => {
    if (/^\[\d{2}:\d{2}:\d{2}\]$/.test(part)) {
      return <span key={`${part}-${index}`} className="log-time">{part}</span>;
    }
    if (/^\[[^\]]+\]$/.test(part)) {
      return <span key={`${part}-${index}`} className="log-token">{part}</span>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export default function LogsPage() {
  const guard = useRustPilot();
  const [mode, setMode] = useState<LogMode>("live");
  const [files, setFiles] = useState<LogFileSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [content, setContent] = useState<LogFileContent | null>(null);
  const [enabledFilters, setEnabledFilters] = useState<Record<FilterKey, boolean>>(initialFilters);
  const [busy, setBusy] = useState<"list" | "file" | null>(null);
  const [clearedViewKey, setClearedViewKey] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");

  async function loadFiles(nextSelected = selectedFile) {
    setBusy("list");
    setMessage("");
    setMessageKind("ok");
    try {
      const nextFiles = await api<LogFileSummary[]>("/logs/files");
      setFiles(nextFiles);
      const nextFile = nextSelected || nextFiles[0]?.fileName || "";
      setSelectedFile(nextFile);
      if (nextFile) await loadFile(nextFile);
      else setContent(null);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function loadFile(fileName: string) {
    setBusy("file");
    setMessage("");
    setMessageKind("ok");
    try {
      const nextContent = await api<LogFileContent>(`/logs/files/${encodeURIComponent(fileName)}`);
      setContent(nextContent);
      setClearedViewKey("");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function selectFile(fileName: string) {
    setSelectedFile(fileName);
    await loadFile(fileName);
  }

  async function copyVisibleLines(lines: LogLine[]) {
    await navigator.clipboard.writeText(lines.map((line) => line.text).join("\n"));
    setMessageKind("ok");
    setMessage("Visible log lines copied.");
  }

  function moveLogFile(direction: "older" | "newer") {
    if (!selectedFile) return;
    const index = files.findIndex((file) => file.fileName === selectedFile);
    const next = files[direction === "older" ? index + 1 : index - 1];
    if (next) void selectFile(next.fileName);
  }

  useEffect(() => {
    if (guard.status?.setup?.setupCompleted) void loadFiles();
  }, [guard.status?.setup?.setupCompleted]);

  const liveLines = useMemo(() => guard.events.map(lineFromEvent), [guard.events]);
  const diskLines = useMemo(
    () => (content?.content ?? "").split(/\r?\n/).filter(Boolean).map(lineFromDisk),
    [content?.content]
  );
  const allLines = mode === "live" ? liveLines : diskLines;
  const currentViewKey = mode === "live" ? "live" : `log:${selectedFile}:${content?.file.modifiedAt ?? ""}`;
  const visibleLines = clearedViewKey === currentViewKey ? [] : allLines.filter((line) => line.categories.some((category) => enabledFilters[category]));
  const fileIndex = files.findIndex((file) => file.fileName === selectedFile);
  const selectedSummary = files[fileIndex];
  const fromTime = mode === "live" ? visibleLines[0]?.timestamp ?? null : selectedSummary?.modifiedAt ?? null;
  const toTime = mode === "live" ? visibleLines.at(-1)?.timestamp ?? null : selectedSummary?.modifiedAt ?? null;

  return (
    <ProtectedPage status={guard.status} error={guard.error} loading={guard.loading} onRetry={guard.refresh}>
      <section className="logs-panel">
        <section className="logs-console-shell">
          <div className="logs-console-toolbar">
            <div className="logs-toolbar-main">
              <div className="logs-title-row">
                <strong>{mode === "live" ? "Live logs" : content?.file.fileName ?? "Saved logs"}</strong>
                <span className={`logs-mode-badge ${mode}`}>{mode.toUpperCase()}</span>
              </div>
              <div className="logs-meta-row">
                <span>{visibleLines.length} visible</span>
                <span>From {formatTime(fromTime)}</span>
                <span>To {formatTime(toTime)}</span>
                {mode === "log" && selectedSummary && (
                  <span title={selectedSummary.path}>{shortenPath(selectedSummary.path, 58)} - {formatBytes(selectedSummary.sizeBytes)}</span>
                )}
              </div>
            </div>
            <div className="logs-toolbar-controls">
              <div className="logs-mode-switch" aria-label="Log mode">
                <button type="button" className={mode === "live" ? "active" : undefined} onClick={() => setMode("live")}>Live</button>
                <button type="button" className={mode === "log" ? "active" : undefined} onClick={() => setMode("log")}>Files</button>
              </div>
              {mode === "log" && (
                <select className="logs-file-select" value={selectedFile} onChange={(event) => selectFile(event.target.value)} disabled={busy !== null || files.length === 0}>
                  {files.length === 0 ? (
                    <option value="">No log files</option>
                  ) : (
                    files.map((file) => (
                      <option key={file.fileName} value={file.fileName}>{file.fileName}</option>
                    ))
                  )}
                </select>
              )}
              <button type="button" onClick={() => moveLogFile("older")} disabled={mode !== "log" || fileIndex < 0 || fileIndex >= files.length - 1}>Older</button>
              <button type="button" onClick={() => moveLogFile("newer")} disabled={mode !== "log" || fileIndex <= 0}>Newer</button>
              <button type="button" onClick={() => (mode === "log" ? loadFiles(selectedFile) : guard.refresh())} disabled={busy !== null}>
                {busy ? "Loading..." : "Refresh"}
              </button>
              <button type="button" onClick={() => setClearedViewKey(currentViewKey)}>Clear</button>
              <button type="button" onClick={() => copyVisibleLines(visibleLines)} disabled={visibleLines.length === 0}>Copy</button>
            </div>
          </div>
          <div className="logs-filter-bar">
            {filters.map((filter) => (
              <label key={filter.key} className={`logs-filter-chip ${enabledFilters[filter.key] ? "active" : ""}`}>
                <input
                  type="checkbox"
                  checked={enabledFilters[filter.key]}
                  onChange={(event) => setEnabledFilters((current) => ({ ...current, [filter.key]: event.target.checked }))}
                />
                <span>{filter.label}</span>
              </label>
            ))}
          </div>
          {message && <p className={`logs-message validation-message ${messageKind}`}>{message}</p>}
          <div className="logs-console" role="log" aria-live={mode === "live" ? "polite" : "off"}>
            {busy === "file" ? (
              <p className="muted">Loading log...</p>
            ) : visibleLines.length === 0 ? (
              <p className="muted">{mode === "live" ? "No live log lines match the active filters." : "No saved log lines match the active filters."}</p>
            ) : (
              visibleLines.map((line) => (
                <div key={line.id} className={`log-line ${line.categories.join(" ")}`}>
                  {highlightLine(line.text)}
                </div>
              ))
            )}
          </div>
        </section>
      </section>
    </ProtectedPage>
  );
}
