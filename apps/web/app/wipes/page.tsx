"use client";
import { useEffect, useState } from "react";
import { defaultWipePlannerConfig, type WipeCustomSchedule, type WipeKind, type WipePlannerConfig, type WipePlannerStatus, type WipeResult, type WipeSeedMode } from "@rustpilot/shared/browser";
import { usePathname } from "next/navigation";
import { api } from "../lib/api";
import { formatLocalDateTime, shortenPath } from "../lib/format";
import { ProtectedPage } from "../lib/ProtectedPage";
import { Tooltip } from "../lib/Tooltip";
import { useRustPilot } from "../lib/useRustPilot";

const wipeKindLabels: Record<WipeKind, string> = {
  map: "Map only",
  blueprints: "Blueprints only",
  map_and_blueprints: "Map + blueprints"
};

const scheduleLabels: Record<WipeCustomSchedule, string> = {
  none: "None",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  one_time: "One-time"
};

const seedModeLabels: Record<WipeSeedMode, string> = {
  keep: "Keep current seed",
  random: "Random new seed",
  set: "Set seed"
};

const weekDays = [
  ["0", "Sunday"],
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"]
] as const;

function localDateTimeValue(date = new Date(Date.now() + 60 * 60_000)): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fromIsoToLocalInput(value: string | null | undefined): string {
  return value ? localDateTimeValue(new Date(value)) : localDateTimeValue();
}

export default function WipesPage() {
  const guard = useRustPilot();
  const pathname = usePathname();
  const activePath = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const wipeView = activePath === "/wipes/custom" ? "custom" : activePath === "/wipes/history" ? "history" : "official";
  const [status, setStatus] = useState<WipePlannerStatus | null>(null);
  const [config, setConfig] = useState<WipePlannerConfig>(defaultWipePlannerConfig);
  const [oneTimeRunAt, setOneTimeRunAt] = useState(localDateTimeValue());
  const [runNowKind, setRunNowKind] = useState<WipeKind>("map");
  const [action, setAction] = useState<"load" | "save" | "cancel" | "run" | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");
  const [confirmRunNow, setConfirmRunNow] = useState(false);

  async function loadStatus() {
    setAction("load");
    setMessage("");
    setMessageKind("ok");
    try {
      const next = await api<WipePlannerStatus>("/wipes/planner");
      setStatus(next);
      setConfig(next.config);
      setOneTimeRunAt(fromIsoToLocalInput(next.config.custom.runAt));
      setRunNowKind(next.config.custom.kind);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(null);
    }
  }

  async function saveConfig() {
    setAction("save");
    setMessage("");
    setMessageKind("ok");
    try {
      const payload: WipePlannerConfig = {
        ...config,
        custom: {
          ...config.custom,
          runAt: config.custom.schedule === "one_time" ? toIsoLocalInput(oneTimeRunAt) : null
        }
      };
      const next = await api<WipePlannerStatus>("/wipes/planner", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setStatus(next);
      setConfig(next.config);
      setMessage("Wipe planner saved.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(null);
    }
  }

  async function cancelCustomSchedule() {
    setAction("cancel");
    setMessage("");
    setMessageKind("ok");
    try {
      const next = await api<WipePlannerStatus>("/wipes/planner/cancel", { method: "POST", body: "{}" });
      setStatus(next);
      setConfig(next.config);
      setMessage("Additional custom wipe schedule cleared.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(null);
    }
  }

  async function runNow() {
    setAction("run");
    setMessage("");
    setMessageKind("ok");
    try {
      const result = await api<WipeResult>("/wipes/run-now", {
        method: "POST",
        body: JSON.stringify({
          kind: runNowKind,
          reason: config.custom.reason,
          backupBeforeWipe: config.custom.backupBeforeWipe,
          restartAfterWipe: config.custom.restartAfterWipe
        })
      });
      setConfirmRunNow(false);
      await loadStatus();
      setMessage(`Wipe completed. Removed ${result.removedFiles.length} file${result.removedFiles.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(null);
    }
  }

  function updateOfficial(next: Partial<WipePlannerConfig["official"]>) {
    setConfig((current) => ({ ...current, official: { ...current.official, ...next } }));
  }

  function updateCustom(next: Partial<WipePlannerConfig["custom"]>) {
    setConfig((current) => ({ ...current, custom: { ...current.custom, ...next } }));
  }

  useEffect(() => {
    if (guard.status?.setup?.setupCompleted) void loadStatus();
  }, [guard.status?.setup?.setupCompleted]);

  return (
    <ProtectedPage status={guard.status} error={guard.error} loading={guard.loading} onRetry={guard.refresh}>
      <section className="card wipes-panel">
        <div className="wipes-header">
          <div>
            <h2>Wipes</h2>
            <p className="muted">{status?.scheduled ? `Next planned wipe: ${formatLocalDateTime(status.runAt)}` : "No wipe planned."}</p>
          </div>
          <button type="button" onClick={loadStatus} disabled={action !== null}>{action === "load" ? "Refreshing..." : "Refresh"}</button>
        </div>

        {wipeView === "official" && <section className="wipe-section">
          <div className="wipe-section-heading">
            <div>
              <h3>Official force wipe <span className="badge recommended">Recommended</span></h3>
              <p className="muted">First Thursday every month. RustPilot updates before wiping.</p>
            </div>
            <span className="badge">{config.official.enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <div className="wipe-grid">
            <label className="checkbox-field">
              <span>Follow official Rust force wipe <Tooltip text="Recommended. Rust's default monthly wipe timer aligns with force wipes: first Thursday every month at 19:00 London time." /></span>
              <input type="checkbox" checked={config.official.enabled} onChange={(event) => updateOfficial({ enabled: event.target.checked })} />
            </label>
            <label>
              Wipe contents <Tooltip text="Official force wipe defaults to map only. Blueprints are only removed when explicitly selected." />
              <select value={config.official.kind} onChange={(event) => updateOfficial({ kind: event.target.value as WipeKind })}>
                <option value="map">Map only</option>
                <option value="map_and_blueprints">Map + blueprints</option>
                <option value="blueprints">Blueprints only</option>
              </select>
            </label>
            {config.official.kind !== "blueprints" && (
              <>
                <label>
                  Seed after wipe <Tooltip text="Only applies to map wipes. Keep uses the current server.seed, Random generates a new seed, Set stores your chosen seed before restart." />
                  <select value={config.official.seedMode} onChange={(event) => updateOfficial({ seedMode: event.target.value as WipeSeedMode })}>
                    <option value="keep">Keep current seed</option>
                    <option value="random">Random new seed</option>
                    <option value="set">Set seed</option>
                  </select>
                </label>
                {config.official.seedMode === "set" && (
                  <label>
                    Seed <Tooltip text="Rust seed value from 0 through 2147483647." />
                    <input type="number" min={0} max={2147483647} value={config.official.seed ?? ""} onChange={(event) => updateOfficial({ seed: event.target.value === "" ? null : Number(event.target.value) })} />
                  </label>
                )}
              </>
            )}
            <div className="readonly-field">
              <span>Server update <Tooltip text="Required for official Rust force wipes. RustPilot stops the server, runs SteamCMD update, then performs the wipe." /></span>
              <strong>Required</strong>
            </div>
            <label className="checkbox-field">
              <span>Restart server after wipe <Tooltip text="Starts RustDedicated.exe again after the official wipe action completes." /></span>
              <input type="checkbox" checked={config.official.restartAfterWipe} onChange={(event) => updateOfficial({ restartAfterWipe: event.target.checked })} />
            </label>
          </div>
        </section>}

        {wipeView === "custom" && <section className="wipe-section">
          <div className="wipe-section-heading">
            <div>
              <h3>Custom wipe schedule</h3>
              <p className="muted">Optional extra wipes. Official force wipe remains separate.</p>
            </div>
            <span className="badge">{scheduleLabels[config.custom.schedule]}</span>
          </div>
          <div className="wipe-grid">
            <label>
              Additional wipe schedule <Tooltip text="Use None to only follow official force wipes. Weekly, biweekly and monthly follow Rust wipe timer terminology." />
              <select value={config.custom.schedule} onChange={(event) => updateCustom({ schedule: event.target.value as WipeCustomSchedule })}>
                <option value="none">None</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="one_time">One-time</option>
              </select>
            </label>
            <label>
              Wipe contents <Tooltip text="Map and blueprint wipes are separate. Blueprints are never removed unless selected here." />
              <select value={config.custom.kind} onChange={(event) => updateCustom({ kind: event.target.value as WipeKind })}>
                <option value="map">Map only</option>
                <option value="map_and_blueprints">Map + blueprints</option>
                <option value="blueprints">Blueprints only</option>
              </select>
            </label>
            {config.custom.kind !== "blueprints" && config.custom.schedule !== "none" && (
              <>
                <label>
                  Seed after wipe <Tooltip text="Only applies to map wipes. Random and Set update server.seed before RustDedicated.exe starts again." />
                  <select value={config.custom.seedMode} onChange={(event) => updateCustom({ seedMode: event.target.value as WipeSeedMode })}>
                    <option value="keep">Keep current seed</option>
                    <option value="random">Random new seed</option>
                    <option value="set">Set seed</option>
                  </select>
                </label>
                {config.custom.seedMode === "set" && (
                  <label>
                    Seed <Tooltip text="Rust seed value from 0 through 2147483647." />
                    <input type="number" min={0} max={2147483647} value={config.custom.seed ?? ""} onChange={(event) => updateCustom({ seed: event.target.value === "" ? null : Number(event.target.value) })} />
                  </label>
                )}
              </>
            )}
            {(config.custom.schedule === "weekly" || config.custom.schedule === "biweekly") && (
              <>
                <label>
                  Wipe day <Tooltip text="Matches Rust's wipeDayofWeek values: Sunday 0 through Saturday 6." />
                  <select value={String(config.custom.weeklyDay ?? 4)} onChange={(event) => updateCustom({ weeklyDay: Number(event.target.value) })}>
                    {weekDays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Wipe time <Tooltip text="Local time where RustPilot runs. Use the server's own wipe timer convars if you need an in-game timer in another timezone." />
                  <input type="time" value={config.custom.weeklyTime ?? "19:00"} onChange={(event) => updateCustom({ weeklyTime: event.target.value })} />
                </label>
              </>
            )}
            {config.custom.schedule === "monthly" && (
              <>
                <label>
                  Monthly weekday <Tooltip text="Monthly custom wipes use the first selected weekday of each month, matching Rust's monthly wipe timer format." />
                  <select value={String(config.custom.monthlyWeekday ?? 4)} onChange={(event) => updateCustom({ monthlyWeekday: Number(event.target.value) })}>
                    {weekDays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  Wipe time <Tooltip text="The custom monthly wipe time. This is separate from the official update window." />
                  <input type="time" value={config.custom.monthlyTime ?? "19:00"} onChange={(event) => updateCustom({ monthlyTime: event.target.value })} />
                </label>
              </>
            )}
            {config.custom.schedule === "one_time" && (
              <label>
                Run at <Tooltip text="A single custom wipe at the selected local date and time." />
                <input type="datetime-local" value={oneTimeRunAt} onChange={(event) => setOneTimeRunAt(event.target.value)} />
              </label>
            )}
            <label>
              Reason <Tooltip text="Optional text written to RustPilot logs when the custom wipe runs." />
              <input value={config.custom.reason ?? ""} onChange={(event) => updateCustom({ reason: event.target.value.trim() || null })} placeholder="Optional reason shown in logs" maxLength={160} />
            </label>
          </div>
          <div className="wipe-options">
            <label className="checkbox-field">
              <span>Create backup before custom wipe <Tooltip text="Recommended. Creates a ZIP backup of Rust identity data and cfg files before the wipe." /></span>
              <input type="checkbox" checked={config.custom.backupBeforeWipe} onChange={(event) => updateCustom({ backupBeforeWipe: event.target.checked })} />
            </label>
            <label className="checkbox-field">
              <span>Restart server after custom wipe <Tooltip text="Starts RustDedicated.exe again after the custom wipe action completes." /></span>
              <input type="checkbox" checked={config.custom.restartAfterWipe} onChange={(event) => updateCustom({ restartAfterWipe: event.target.checked })} />
            </label>
          </div>
        </section>}

        <div className="actions">
          {wipeView !== "history" && (
            <button type="button" className="primary" onClick={saveConfig} disabled={action !== null}>{action === "save" ? "Saving..." : "Save wipe planner"}</button>
          )}
          {wipeView === "custom" && (
            <button type="button" onClick={cancelCustomSchedule} disabled={action !== null || config.custom.schedule === "none"}>{action === "cancel" ? "Clearing..." : "Clear custom schedule"}</button>
          )}
          {wipeView === "history" && (
            <>
              <select value={runNowKind} onChange={(event) => setRunNowKind(event.target.value as WipeKind)} aria-label="Run now wipe contents">
                <option value="map">Map only</option>
                <option value="map_and_blueprints">Map + blueprints</option>
                <option value="blueprints">Blueprints only</option>
              </select>
              <button type="button" className="danger" onClick={() => setConfirmRunNow(true)} disabled={action !== null}>{action === "run" ? "Wiping..." : "Run custom wipe now"}</button>
            </>
          )}
          {message && <span className={`validation-message ${messageKind}`}>{message}</span>}
        </div>

        {wipeView === "custom" && status?.customReplacedByOfficial && (
          <p className="validation-message ok">The custom wipe is within the conflict window and will be combined with the official Rust force wipe.</p>
        )}

        {wipeView === "history" && <div className="wipe-status-grid">
          <section>
            <h3>Next planned action</h3>
            <div className="metric"><span>Source</span><strong>{status?.source ?? "n/a"}</strong></div>
            <div className="metric"><span>Run at</span><strong>{formatLocalDateTime(status?.runAt)}</strong></div>
            <div className="metric"><span>Official seed</span><strong>{seedModeLabels[config.official.seedMode]}{config.official.seedMode === "set" ? ` ${config.official.seed ?? ""}` : ""}</strong></div>
            <div className="metric"><span>Custom seed</span><strong>{config.custom.schedule === "none" ? "n/a" : `${seedModeLabels[config.custom.seedMode]}${config.custom.seedMode === "set" ? ` ${config.custom.seed ?? ""}` : ""}`}</strong></div>
            <div className="metric"><span>Official force wipe</span><strong>{formatLocalDateTime(status?.officialRunAt)}</strong></div>
            <div className="metric"><span>Custom wipe</span><strong>{formatLocalDateTime(status?.customRunAt)}</strong></div>
            <div className="metric"><span>Conflict window</span><strong>{config.conflictWindowMinutes} min</strong></div>
          </section>
          <section>
            <h3>Last wipe</h3>
            <div className="metric"><span>Wiped at</span><strong>{formatLocalDateTime(status?.lastWipeAt)}</strong></div>
            <div className="metric"><span>Source</span><strong>{status?.lastResult?.source ?? "n/a"}</strong></div>
            <div className="metric"><span>Backup</span><strong>{status?.lastResult?.backupFileName ?? "n/a"}</strong></div>
            <div className="metric"><span>SteamCMD update</span><strong>{status?.lastResult?.steamCmdUpdated ? "yes" : "no"}</strong></div>
            <div className="metric"><span>Seed</span><strong>{status?.lastResult?.seed ?? "n/a"}</strong></div>
            <div className="metric"><span>Last error</span><strong>{status?.lastError ?? "n/a"}</strong></div>
          </section>
        </div>}
        {wipeView === "history" && status?.lastResult && status.lastResult.removedFiles.length > 0 && (
          <div className="wipe-removed-list">
            <h3>Removed files</h3>
            {status.lastResult.removedFiles.map((file) => (
              <span key={file} title={file}>{shortenPath(file, 90)}</span>
            ))}
          </div>
        )}
        {confirmRunNow && (
          <div className="modal-backdrop" role="presentation">
            <section className="modal danger-modal" role="dialog" aria-modal="true" aria-labelledby="wipe-now-title">
              <h2 id="wipe-now-title">Run custom wipe now</h2>
              <p className="muted">This stops the server first and immediately runs the selected wipe action.</p>
              <div className="metric"><span>Wipe contents</span><strong>{wipeKindLabels[runNowKind]}</strong></div>
              <div className="metric"><span>Backup before wipe</span><strong>{config.custom.backupBeforeWipe ? "yes" : "no"}</strong></div>
              <div className="metric"><span>Restart after wipe</span><strong>{config.custom.restartAfterWipe ? "yes" : "no"}</strong></div>
              <div className="actions">
                <button type="button" onClick={() => setConfirmRunNow(false)} disabled={action !== null}>Cancel</button>
                <button type="button" className="danger" onClick={runNow} disabled={action !== null}>
                  {action === "run" ? "Wiping..." : "Run wipe"}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </ProtectedPage>
  );
}
