"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { defaultServerSettings } from "@rustpilot/shared/browser";
import { api } from "../lib/api";
import { useRustPilot } from "../lib/useRustPilot";
import { ProtectedPage } from "../lib/ProtectedPage";
import { getDashboardActionStates } from "../lib/actions";

export default function SettingsPage() {
  const guard = useRustPilot();
  const restartScheduleInitialized = useRef(false);
  const [form, setForm] = useState<any>(defaultServerSettings);
  const [restartScheduleEnabled, setRestartScheduleEnabled] = useState(false);
  const [restartScheduleTimes, setRestartScheduleTimes] = useState<string[]>([]);
  const [restartScheduleTime, setRestartScheduleTime] = useState("06:00");
  const [restartScheduleReason, setRestartScheduleReason] = useState("");
  const [restartScheduleMessage, setRestartScheduleMessage] = useState("");
  const [restartScheduleMessageKind, setRestartScheduleMessageKind] = useState<"ok" | "error">("ok");
  const [restartScheduleSaving, setRestartScheduleSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");
  const [serverFileMessage, setServerFileMessage] = useState("");
  const [serverFileMessageKind, setServerFileMessageKind] = useState<"ok" | "error">("ok");
  const [serverFileAction, setServerFileAction] = useState<"install" | "update" | null>(null);
  const [dangerMessage, setDangerMessage] = useState("");
  const [dangerMessageKind, setDangerMessageKind] = useState<"ok" | "error">("ok");
  const [confirmationText, setConfirmationText] = useState("");
  const [confirmingAction, setConfirmingAction] = useState<"wipe" | "reset" | null>(null);
  const [dangerAction, setDangerAction] = useState<"wipe" | "reset" | null>(null);
  const requiredConfirmation = confirmingAction === "wipe" ? "WIPE SERVER" : "RESET INSTALLATION";
  const confirmingTitle = confirmingAction === "wipe" ? "Wipe server data" : "Reset installation";
  const confirmingDescription =
    confirmingAction === "wipe"
      ? "This stops the server and deletes the current identity/save data. SteamCMD and installed server files stay in place."
      : "This stops the server, removes managed SteamCMD/server/profile/log folders, clears setup state, and sends RustPilot back to setup.";
  const serverFileActions = getDashboardActionStates({
    setupCompleted: guard.status?.setup?.setupCompleted === true,
    installationState: guard.status?.setup?.installationState,
    processState: guard.status?.process?.processState,
    installRunning: guard.status?.installRunning
  });
  useEffect(() => {
    api<any>("/settings").then((settings) => setForm({ ...defaultServerSettings, ...settings, rconPassword: "" }));
  }, []);
  useEffect(() => {
    const schedule = guard.status?.scheduledRestart?.schedule;
    if (!schedule || restartScheduleInitialized.current) return;
    restartScheduleInitialized.current = true;
    setRestartScheduleEnabled(schedule.enabled);
    setRestartScheduleTimes(schedule.times);
    setRestartScheduleReason(schedule.reason ?? "");
  }, [guard.status?.scheduledRestart?.schedule]);
  function set(name: string, value: unknown) {
    setForm((current: any) => ({ ...current, [name]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setMessageKind("ok");
    const body = { ...form };
    if (body.rconPassword === "") delete body.rconPassword;
    try {
      const settings = await api<any>("/settings", { method: "PUT", body: JSON.stringify(body) });
      setForm({ ...defaultServerSettings, ...settings, rconPassword: "" });
      setMessage("Settings saved. Server launch settings apply on the next restart.");
      await guard.refresh();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }
  async function wipeServer() {
    setDangerAction("wipe");
    setDangerMessage("");
    setDangerMessageKind("ok");
    try {
      await api("/admin/wipe-server", {
        method: "POST",
        body: JSON.stringify({ confirmation: confirmationText })
      });
      closeConfirmation();
      setDangerMessageKind("ok");
      setDangerMessage("Server identity data wiped. Start the server to generate fresh data.");
      await guard.refresh();
    } catch (error) {
      setDangerMessageKind("error");
      setDangerMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDangerAction(null);
    }
  }
  async function resetInstallation() {
    setDangerAction("reset");
    setDangerMessage("");
    setDangerMessageKind("ok");
    try {
      await api("/admin/reset-installation", {
        method: "POST",
        body: JSON.stringify({ confirmation: confirmationText })
      });
      location.href = "/setup";
    } catch (error) {
      setDangerMessageKind("error");
      setDangerMessage(error instanceof Error ? error.message : String(error));
      setDangerAction(null);
    }
  }
  async function runServerFileAction(path: string, action: "install" | "update") {
    setServerFileAction(action);
    setServerFileMessage("");
    setServerFileMessageKind("ok");
    try {
      await api(path, { method: "POST", body: "{}" });
      setServerFileMessage(action === "install" ? "Installation started." : "Update started.");
      await guard.refresh();
    } catch (error) {
      setServerFileMessageKind("error");
      setServerFileMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setServerFileAction(null);
    }
  }
  function addRestartTime() {
    if (!restartScheduleTime || restartScheduleTimes.includes(restartScheduleTime)) return;
    setRestartScheduleTimes((current) => [...current, restartScheduleTime].sort());
  }
  function removeRestartTime(time: string) {
    setRestartScheduleTimes((current) => current.filter((value) => value !== time));
  }
  async function saveRestartSchedule() {
    setRestartScheduleSaving(true);
    setRestartScheduleMessage("");
    setRestartScheduleMessageKind("ok");
    try {
      await api("/scheduler/restart/schedule", {
        method: "PUT",
        body: JSON.stringify({
          enabled: restartScheduleEnabled,
          times: restartScheduleTimes,
          reason: restartScheduleReason.trim() || null
        })
      });
      setRestartScheduleMessage("Restart schedule saved.");
      await guard.refresh();
    } catch (error) {
      setRestartScheduleMessageKind("error");
      setRestartScheduleMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRestartScheduleSaving(false);
    }
  }
  function openConfirmation(action: "wipe" | "reset") {
    setConfirmingAction(action);
    setConfirmationText("");
    setDangerMessage("");
  }
  function closeConfirmation() {
    setConfirmingAction(null);
    setConfirmationText("");
  }
  async function confirmDangerAction() {
    if (confirmingAction === "wipe") await wipeServer();
    if (confirmingAction === "reset") await resetInstallation();
  }
  return (
    <ProtectedPage status={guard.status} error={guard.error} loading={guard.loading} onRetry={guard.refresh}>
      <form className="panel" onSubmit={submit}>
        <div className="form">
          <label>Hostname<input value={form.hostname} onChange={(e) => set("hostname", e.target.value)} /></label>
          <label>Identity<input value={form.identity} onChange={(e) => set("identity", e.target.value)} /></label>
          <label>Max players<input type="number" value={form.maxPlayers} onChange={(e) => set("maxPlayers", Number(e.target.value))} /></label>
          <label>Game port<input type="number" value={form.gamePort} onChange={(e) => set("gamePort", Number(e.target.value))} /></label>
          <label>Query port<input type="number" value={form.queryPort} onChange={(e) => set("queryPort", Number(e.target.value))} /></label>
          <label>RCON port<input type="number" value={form.rconPort} onChange={(e) => set("rconPort", Number(e.target.value))} /></label>
          <label>RCON password<input type="password" value={form.rconPassword} onChange={(e) => set("rconPassword", e.target.value)} placeholder="New password required when saving" /></label>
          <label>World size<input type="number" value={form.worldSize} onChange={(e) => set("worldSize", Number(e.target.value))} /></label>
          <label>Seed<input type="number" value={form.seed} onChange={(e) => set("seed", Number(e.target.value))} /></label>
          <label>Save interval<input type="number" value={form.saveInterval} onChange={(e) => set("saveInterval", Number(e.target.value))} /></label>
          <label>Server URL<input value={form.serverUrl} onChange={(e) => set("serverUrl", e.target.value)} /></label>
          <label>Header image URL<input value={form.headerImageUrl} onChange={(e) => set("headerImageUrl", e.target.value)} /></label>
          <label>Graceful shutdown timeout<input type="number" value={form.gracefulShutdownTimeoutSeconds} onChange={(e) => set("gracefulShutdownTimeoutSeconds", Number(e.target.value))} /></label>
          <label><span>Auto-start</span><input type="checkbox" checked={form.autoStart} onChange={(e) => set("autoStart", e.target.checked)} /></label>
          <label><span>Open browser automatically</span><input type="checkbox" checked={form.openBrowser} onChange={(e) => set("openBrowser", e.target.checked)} /></label>
        </div>
        <label style={{ marginTop: 14 }}>Description<textarea value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
        <p className="muted">Changes to server launch settings require a RustDedicated.exe restart.</p>
        <div className="actions"><button className="primary">Save</button><span className={messageKind === "error" ? "validation-message error" : "muted"}>{message}</span></div>
      </form>
      <section className="panel server-files-panel">
        <div>
          <h2>Server files</h2>
          <p className="muted">Install or update SteamCMD and Rust Dedicated Server files. Updates require the server process to be stopped.</p>
        </div>
        <div className="server-files-actions">
          <button
            onClick={() => runServerFileAction("/install", "install")}
            disabled={!serverFileActions.install || serverFileAction !== null}
          >
            {serverFileAction === "install" ? "Installing..." : "Install"}
          </button>
          <button
            onClick={() => runServerFileAction("/update", "update")}
            disabled={!serverFileActions.update || serverFileAction !== null}
          >
            {serverFileAction === "update" ? "Updating..." : "Update"}
          </button>
        </div>
        {serverFileMessage && <p className={`validation-message ${serverFileMessageKind}`}>{serverFileMessage}</p>}
      </section>
      <section className="panel restart-schedule-panel">
        <div>
          <h2>Restart schedule</h2>
          <p className="muted">
            Fixed daily restart times use the local timezone where RustPilot runs: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </p>
        </div>
        <label className="checkbox-field">
          <span>Enable fixed daily restarts</span>
          <input type="checkbox" checked={restartScheduleEnabled} onChange={(event) => setRestartScheduleEnabled(event.target.checked)} />
        </label>
        <div className="restart-time-editor">
          <label>
            Restart time
            <input type="time" value={restartScheduleTime} onChange={(event) => setRestartScheduleTime(event.target.value)} />
          </label>
          <button type="button" onClick={addRestartTime}>Add time</button>
        </div>
        <div className="restart-time-list">
          {restartScheduleTimes.length === 0 ? (
            <p className="muted">No fixed restart times configured.</p>
          ) : restartScheduleTimes.map((time) => (
            <span className="restart-time-chip" key={time}>
              {time}
              <button type="button" onClick={() => removeRestartTime(time)} aria-label={`Remove ${time}`}>x</button>
            </span>
          ))}
        </div>
        <label>
          Restart reason
          <input value={restartScheduleReason} onChange={(event) => setRestartScheduleReason(event.target.value)} placeholder="Optional reason shown in logs" maxLength={160} />
        </label>
        <div className="actions">
          <button type="button" className="primary" onClick={saveRestartSchedule} disabled={restartScheduleSaving || (restartScheduleEnabled && restartScheduleTimes.length === 0)}>
            {restartScheduleSaving ? "Saving..." : "Save restart schedule"}
          </button>
          {restartScheduleMessage && <span className={`validation-message ${restartScheduleMessageKind}`}>{restartScheduleMessage}</span>}
        </div>
      </section>
      <section className="panel danger-zone">
        <div className="danger-zone-header">
          <h2>DANGER ZONE</h2>
          <p>Destructive actions require exact confirmation and stop the server before changing files.</p>
        </div>
        <div className="danger-action">
          <div>
            <h3>Wipe server data</h3>
            <p className="muted">Stops the server and deletes the current identity/save data. SteamCMD and installed server files stay in place.</p>
          </div>
          <button className="danger" onClick={() => openConfirmation("wipe")} disabled={dangerAction !== null}>
            Wipe server data
          </button>
        </div>
        <div className="danger-action">
          <div>
            <h3>Reset installation</h3>
            <p className="muted">Stops the server, removes managed SteamCMD/server/profile/log folders, clears setup state, and sends RustPilot back to setup.</p>
          </div>
          <button className="danger" onClick={() => openConfirmation("reset")} disabled={dangerAction !== null}>
            Reset installation
          </button>
        </div>
        {dangerMessage && <p className={`validation-message ${dangerMessageKind}`}>{dangerMessage}</p>}
      </section>
      {confirmingAction && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal danger-modal" role="dialog" aria-modal="true" aria-labelledby="danger-confirm-title">
            <h2 id="danger-confirm-title">{confirmingTitle}</h2>
            <p className="muted">{confirmingDescription}</p>
            <label>
              <span>Type <strong>{requiredConfirmation}</strong> to confirm</span>
              <input autoFocus value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} />
            </label>
            <div className="actions">
              <button onClick={closeConfirmation} disabled={dangerAction !== null}>Cancel</button>
              <button
                className="danger"
                onClick={confirmDangerAction}
                disabled={confirmationText !== requiredConfirmation || dangerAction !== null}
              >
                {dangerAction === "wipe" ? "Wiping..." : dangerAction === "reset" ? "Resetting..." : confirmingTitle}
              </button>
            </div>
          </section>
        </div>
      )}
    </ProtectedPage>
  );
}
