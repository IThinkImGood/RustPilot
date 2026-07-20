"use client";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRustPilot } from "../lib/useRustPilot";
import { api } from "../lib/api";
import { ProtectedPage } from "../lib/ProtectedPage";

export default function ConsolePage() {
  const { status, events, setEvents, wsState, error, loading, refresh } = useRustPilot();
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [source, setSource] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => events.filter((event) => source === "all" || event.source === source), [events, source]);

  useEffect(() => {
    if (autoScroll) ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [filtered, autoScroll]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = command.trim();
    if (!text) return;
    await api("/server/command", { method: "POST", body: JSON.stringify({ command: text }) });
    setHistory((current) => [text, ...current.slice(0, 49)]);
    setHistoryIndex(null);
    setCommand("");
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = historyIndex === null ? 0 : Math.min(history.length - 1, historyIndex + 1);
      setHistoryIndex(next);
      setCommand(history[next] ?? "");
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = historyIndex === null ? null : historyIndex - 1;
      setHistoryIndex(next !== null && next >= 0 ? next : null);
      setCommand(next !== null && next >= 0 ? history[next] ?? "" : "");
    }
  }

  return (
    <ProtectedPage status={status} error={error} loading={loading} onRetry={refresh}>
      <section className="card console-panel">
        <div className="console-panel-header">
          <div className="actions">
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="all">All sources</option>
              <option value="rustpilot">RustPilot</option>
              <option value="steamcmd">SteamCMD</option>
              <option value="rust-server">Rust server</option>
            </select>
            <label className="inline-check">
              <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
              auto-scroll
            </label>
            <button onClick={() => setEvents([])}>Clear local view</button>
          </div>
          <span className="status">WebSocket {wsState}</span>
        </div>
        <div className="console" ref={ref} onScroll={() => {
          const el = ref.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 80) setAutoScroll(false);
        }}>
          {filtered.map((event) => (
            <div className={`line ${event.stream === "stderr" ? "stderr" : ""} ${event.stream === "input" ? "inputline" : ""}`} key={event.id}>
              [{new Date(event.timestamp).toLocaleTimeString()}] [{event.source}] {event.message}
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="actions console-command">
          <input
            value={command}
            onKeyDown={keyDown}
            onChange={(event) => setCommand(event.target.value)}
            disabled={status?.process?.processState !== "running"}
            placeholder={status?.process?.processState === "running" ? "Server command" : "Server is not running"}
          />
          <button className="primary" disabled={status?.process?.processState !== "running"}>Send</button>
        </form>
      </section>
    </ProtectedPage>
  );
}
