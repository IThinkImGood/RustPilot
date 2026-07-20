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
  const [announcement, setAnnouncement] = useState("");
  const [playerTarget, setPlayerTarget] = useState("");
  const [reason, setReason] = useState("");
  const [restartDelay, setRestartDelay] = useState("15");
  const [restartReason, setRestartReason] = useState("");
  const [rconBusy, setRconBusy] = useState<string | null>(null);
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

  async function rconAction(path: string, name: string, body: Record<string, string> = {}) {
    setRconBusy(name);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      if (name === "say") setAnnouncement("");
      if (name === "kick" || name === "ban") {
        setPlayerTarget("");
        setReason("");
      }
      if (name === "schedule-restart") setRestartReason("");
      await refresh();
    } finally {
      setRconBusy(null);
    }
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
      <div className="topbar">
        <h1>Console</h1>
        <span className="status">WebSocket {wsState}</span>
      </div>
      <div className="actions" style={{ marginBottom: 12 }}>
        <select value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="all">All sources</option>
          <option value="rustpilot">RustPilot</option>
          <option value="steamcmd">SteamCMD</option>
          <option value="rust-server">Rust server</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
          auto-scroll
        </label>
        <button onClick={() => setEvents([])}>Clear local view</button>
        <button onClick={() => rconAction("/rcon/connect", "connect")} disabled={status?.process?.processState !== "running" || rconBusy !== null}>
          {rconBusy === "connect" ? "Connecting..." : `WebRCON ${status?.rcon?.state ?? "unknown"}`}
        </button>
        <button onClick={() => rconAction("/rcon/server-info", "server-info")} disabled={status?.process?.processState !== "running" || rconBusy !== null}>Server info</button>
        <button onClick={() => rconAction("/rcon/players", "players")} disabled={status?.process?.processState !== "running" || rconBusy !== null}>Players</button>
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
      <form onSubmit={submit} className="actions" style={{ marginTop: 12 }}>
        <input
          style={{ flex: 1 }}
          value={command}
          onKeyDown={keyDown}
          onChange={(event) => setCommand(event.target.value)}
          disabled={status?.process?.processState !== "running"}
          placeholder={status?.process?.processState === "running" ? "Server command" : "Server is not running"}
        />
        <button className="primary" disabled={status?.process?.processState !== "running"}>Send</button>
      </form>
      <div className="panel console-tools">
        <h2>WebRCON Tools</h2>
        <div className="form">
          <label>
            Announcement
            <input value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Message to all players" maxLength={200} />
          </label>
          <label>
            Player name or Steam ID
            <input value={playerTarget} onChange={(event) => setPlayerTarget(event.target.value)} placeholder="Player target" maxLength={80} />
          </label>
          <label>
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" maxLength={160} />
          </label>
          <label>
            Restart delay minutes
            <input type="number" min={1} max={1440} value={restartDelay} onChange={(event) => setRestartDelay(event.target.value)} />
          </label>
          <label>
            Restart reason
            <input value={restartReason} onChange={(event) => setRestartReason(event.target.value)} placeholder="Optional restart reason" maxLength={160} />
          </label>
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button onClick={() => rconAction("/rcon/say", "say", { message: announcement })} disabled={status?.process?.processState !== "running" || !announcement.trim() || rconBusy !== null}>
            {rconBusy === "say" ? "Sending..." : "Announce"}
          </button>
          <button onClick={() => rconAction("/rcon/kick", "kick", { player: playerTarget, reason })} disabled={status?.process?.processState !== "running" || !playerTarget.trim() || rconBusy !== null}>
            {rconBusy === "kick" ? "Kicking..." : "Kick"}
          </button>
          <button className="danger" onClick={() => rconAction("/rcon/ban", "ban", { player: playerTarget, reason })} disabled={status?.process?.processState !== "running" || !playerTarget.trim() || rconBusy !== null}>
            {rconBusy === "ban" ? "Banning..." : "Ban"}
          </button>
          <button onClick={() => rconAction("/scheduler/restart", "schedule-restart", { delayMinutes: restartDelay, reason: restartReason })} disabled={status?.process?.processState !== "running" || rconBusy !== null}>
            {rconBusy === "schedule-restart" ? "Scheduling..." : "Schedule restart"}
          </button>
          <button onClick={() => rconAction("/scheduler/restart/cancel", "cancel-restart")} disabled={!status?.scheduledRestart?.scheduled || rconBusy !== null}>
            {rconBusy === "cancel-restart" ? "Cancelling..." : "Cancel restart"}
          </button>
        </div>
        <p className="muted">Scheduled restart: {status?.scheduledRestart?.scheduled ? formatRestart(status.scheduledRestart.runAt) : "none"}</p>
      </div>
    </ProtectedPage>
  );
}

function formatRestart(runAt?: string | null) {
  return runAt ? new Date(runAt).toLocaleString() : "none";
}
