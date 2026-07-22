"use client";
import { useState } from "react";
import { api } from "./api";
import { getDashboardActionStates } from "./actions";
import { labelProcessState } from "./format";
import type { StatusData } from "./useRustPilot";

function ControlIcon({ name }: { name: "play" | "stop" | "restart" | "kickAll" | "megaphone" | "pending" }) {
  if (name === "pending") return <span className="nav-server-pending-icon">...</span>;
  return (
    <svg className="nav-server-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "play" && <path className="nav-server-filled-icon" d="M8 5v14l11-7z" />}
      {name === "stop" && <path className="nav-server-filled-icon" d="M7 7h10v10H7z" />}
      {name === "restart" && (
        <>
          <path d="M18 7v5h-5" />
          <path d="M17 12a5 5 0 1 1-1.5-3.6L18 11" />
        </>
      )}
      {name === "megaphone" && (
        <>
          <path d="M4 10v4h3l9 4V6l-9 4H4z" />
          <path d="M7 14l1.5 5h3" />
          <path d="M19 9.5a4 4 0 0 1 0 5" />
        </>
      )}
      {name === "kickAll" && (
        <>
          <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path d="M3 19a5 5 0 0 1 10 0" />
          <path d="M15 8l5 5" />
          <path d="M20 8l-5 5" />
        </>
      )}
    </svg>
  );
}

export function ServerControlsPanel({ status, refresh }: { status: StatusData | null; refresh: () => Promise<void> }) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [kickAllOpen, setKickAllOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [restartDelay, setRestartDelay] = useState("15");
  const [restartReason, setRestartReason] = useState("");
  const setupCompleted = status?.setup?.setupCompleted === true;
  const processState = status?.process?.processState ?? "stopped";
  const serverRunning = processState === "running";
  const scheduledRestart = status?.scheduledRestart;
  const canCancelRestart = scheduledRestart?.scheduled === true && scheduledRestart.kind !== "daily";
  const actions = getDashboardActionStates({
    setupCompleted,
    installationState: status?.setup?.installationState,
    processState,
    installRunning: status?.installRunning
  });

  async function runAction(path: string, name: string) {
    if (!setupCompleted) return;
    setPendingAction(name);
    setMessage("");
    try {
      await api(path, { method: "POST", body: "{}" });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function sendAnnouncement() {
    const text = announcement.trim();
    if (!text) return;
    setPendingAction("announcement");
    setMessage("");
    try {
      await api("/rcon/say", { method: "POST", body: JSON.stringify({ message: text }) });
      setAnnouncement("");
      setAnnouncementOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function kickAllPlayers() {
    setPendingAction("kick-all");
    setMessage("");
    try {
      await api("/rcon/kick-all", { method: "POST", body: "{}" });
      setKickAllOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function scheduleRestart() {
    setPendingAction("schedule-restart");
    setMessage("");
    try {
      await api("/scheduler/restart", {
        method: "POST",
        body: JSON.stringify({ delayMinutes: restartDelay, reason: restartReason })
      });
      setRestartOpen(false);
      setRestartReason("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function cancelRestart() {
    setPendingAction("cancel-restart");
    setMessage("");
    try {
      await api("/scheduler/restart/cancel", { method: "POST", body: "{}" });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingAction(null);
    }
  }

  function toggleServer() {
    if (serverRunning) {
      void runAction("/server/stop", "stop");
      return;
    }
    void runAction("/server/start", "start");
  }

  const toggleDisabled = serverRunning ? !actions.stop : !actions.start;
  const togglePending = pendingAction === "start" || pendingAction === "stop";
  const toggleLabel = togglePending
    ? pendingAction === "start"
      ? "Starting server"
      : "Stopping server"
    : serverRunning
      ? "Stop server"
      : "Start server";

  return (
    <>
      <section className="nav-server-controls" aria-label="Server controls">
        <div className="nav-server-status">
          <span>Server</span>
          <strong className="badge">{labelProcessState(processState)}</strong>
        </div>
        <div className="nav-server-buttons">
          <button
            className="primary nav-server-icon-button"
            onClick={toggleServer}
            disabled={toggleDisabled || pendingAction !== null}
            title={toggleLabel}
            aria-label={toggleLabel}
          >
            <ControlIcon name={togglePending ? "pending" : serverRunning ? "stop" : "play"} />
          </button>
          <button
            className="nav-server-icon-button"
            onClick={() => runAction("/server/restart", "restart")}
            disabled={!actions.restart || pendingAction !== null}
            title={pendingAction === "restart" ? "Restarting server" : "Restart server"}
            aria-label={pendingAction === "restart" ? "Restarting server" : "Restart server"}
          >
            <ControlIcon name={pendingAction === "restart" ? "pending" : "restart"} />
          </button>
          <button
            className="nav-server-icon-button"
            onClick={() => setKickAllOpen(true)}
            disabled={!setupCompleted || !serverRunning || pendingAction !== null}
            title="Kick all players"
            aria-label="Kick all players"
          >
            <ControlIcon name={pendingAction === "kick-all" ? "pending" : "kickAll"} />
          </button>
          <button
            className="nav-server-icon-button"
            onClick={() => setAnnouncementOpen(true)}
            disabled={!setupCompleted || !serverRunning || pendingAction !== null}
            title="Send announcement"
            aria-label="Send announcement"
          >
            <ControlIcon name="megaphone" />
          </button>
        </div>
        <div className="nav-restart-panel">
          <h3>Next Restart:</h3>
          <p>{formatRestartCountdown(scheduledRestart?.runAt)}</p>
          <div className="nav-restart-actions">
            <button onClick={() => setRestartOpen(true)} disabled={!setupCompleted || !serverRunning || pendingAction !== null}>
              Edit
            </button>
            <button onClick={cancelRestart} disabled={!canCancelRestart || pendingAction !== null}>
              {pendingAction === "cancel-restart" ? "Canceling..." : "Cancel"}
            </button>
          </div>
        </div>
        {message && <p className="nav-server-message">{message}</p>}
      </section>
      {restartOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="restart-title">
            <h2 id="restart-title">Scheduled restart</h2>
            <p className="muted">Plan the next automatic server restart.</p>
            <div className="form">
              <label>
                Delay minutes
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={1440}
                  value={restartDelay}
                  onChange={(event) => setRestartDelay(event.target.value)}
                />
              </label>
              <label>
                Reason
                <input
                  value={restartReason}
                  onChange={(event) => setRestartReason(event.target.value)}
                  placeholder="Optional restart reason"
                  maxLength={160}
                />
              </label>
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button onClick={() => setRestartOpen(false)} disabled={pendingAction !== null}>Cancel</button>
              <button className="primary" onClick={scheduleRestart} disabled={!serverRunning || pendingAction !== null}>
                {pendingAction === "schedule-restart" ? "Saving..." : "Save"}
              </button>
            </div>
          </section>
        </div>
      )}
      {kickAllOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="kick-all-title">
            <h2 id="kick-all-title">Kick all players</h2>
            <p className="muted">This immediately removes every connected player from the server.</p>
            <div className="actions">
              <button onClick={() => setKickAllOpen(false)} disabled={pendingAction !== null}>Cancel</button>
              <button className="danger" onClick={kickAllPlayers} disabled={pendingAction !== null}>
                {pendingAction === "kick-all" ? "Kicking..." : "Kick all players"}
              </button>
            </div>
          </section>
        </div>
      )}
      {announcementOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
            <h2 id="announcement-title">Announcement</h2>
            <p className="muted">Send a message to all players on the server.</p>
            <label>
              <span>Message</span>
              <textarea
                autoFocus
                value={announcement}
                maxLength={200}
                onChange={(event) => setAnnouncement(event.target.value)}
                placeholder="Message to all players"
              />
            </label>
            <div className="actions">
              <button onClick={() => setAnnouncementOpen(false)} disabled={pendingAction !== null}>Cancel</button>
              <button className="primary" onClick={sendAnnouncement} disabled={!announcement.trim() || pendingAction !== null}>
                {pendingAction === "announcement" ? "Sending..." : "Send"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function formatRestartCountdown(runAt?: string | null) {
  if (!runAt) return "not scheduled";
  const ms = new Date(runAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "due now";
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `in ${hours} hour${hours === 1 ? "" : "s"}, ${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
