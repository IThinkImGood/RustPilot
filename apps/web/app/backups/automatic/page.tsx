"use client";
import { useEffect, useState } from "react";
import type { BackupScheduleStatus } from "@rustpilot/shared/browser";
import { api } from "../../lib/api";
import { formatLocalDateTime } from "../../lib/format";
import { ProtectedPage } from "../../lib/ProtectedPage";
import { useRustPilot } from "../../lib/useRustPilot";

export default function AutomaticBackupsPage() {
  const guard = useRustPilot();
  const [schedule, setSchedule] = useState<BackupScheduleStatus | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>([]);
  const [scheduleTime, setScheduleTime] = useState("03:00");
  const [retentionCount, setRetentionCount] = useState(20);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");

  async function loadSchedule() {
    setMessage("");
    setMessageKind("ok");
    try {
      const status = await api<BackupScheduleStatus>("/backups/schedule");
      setSchedule(status);
      setScheduleEnabled(status.schedule.enabled);
      setScheduleTimes(status.schedule.times);
      setRetentionCount(status.schedule.retentionCount);
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function addScheduleTime() {
    if (!scheduleTime || scheduleTimes.includes(scheduleTime)) return;
    setScheduleTimes((current) => [...current, scheduleTime].sort());
  }

  function removeScheduleTime(time: string) {
    setScheduleTimes((current) => current.filter((value) => value !== time));
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    setMessage("");
    setMessageKind("ok");
    try {
      const status = await api<BackupScheduleStatus>("/backups/schedule", {
        method: "PUT",
        body: JSON.stringify({
          enabled: scheduleEnabled,
          times: scheduleTimes,
          retentionCount
        })
      });
      setSchedule(status);
      setScheduleEnabled(status.schedule.enabled);
      setScheduleTimes(status.schedule.times);
      setRetentionCount(status.schedule.retentionCount);
      setMessage("Automatic backup schedule saved.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setScheduleSaving(false);
    }
  }

  useEffect(() => {
    if (guard.status?.setup?.setupCompleted) void loadSchedule();
  }, [guard.status?.setup?.setupCompleted]);

  return (
    <ProtectedPage status={guard.status} error={guard.error} loading={guard.loading} onRetry={guard.refresh}>
      <section className="card backups-page-panel automatic-only">
        <div className="backups-header">
          <div>
            <h2>Automatic backups</h2>
            <p className="muted">Create backups at fixed daily times. RustPilot uses the local timezone of this machine.</p>
          </div>
          <span className="badge">{schedule?.scheduled ? `Next: ${formatLocalDateTime(schedule.runAt)}` : "Not scheduled"}</span>
        </div>
        <section className="backup-schedule-panel standalone">
          <label className="checkbox-field">
            <span>Enable automatic daily backups</span>
            <input type="checkbox" checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} />
          </label>
          <div className="backup-schedule-grid">
            <label>
              Backup time
              <input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
            </label>
            <button type="button" onClick={addScheduleTime}>Add time</button>
            <label>
              Keep latest backups
              <input type="number" min={1} max={200} value={retentionCount} onChange={(event) => setRetentionCount(Number(event.target.value))} />
            </label>
          </div>
          <div className="restart-time-list">
            {scheduleTimes.length === 0 ? (
              <p className="muted">No automatic backup times configured.</p>
            ) : scheduleTimes.map((time) => (
              <span className="restart-time-chip" key={time}>
                {time}
                <button type="button" onClick={() => removeScheduleTime(time)} aria-label={`Remove ${time}`}>x</button>
              </span>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={saveSchedule} disabled={scheduleSaving || (scheduleEnabled && scheduleTimes.length === 0)}>
              {scheduleSaving ? "Saving..." : "Save automatic backups"}
            </button>
            <button type="button" onClick={loadSchedule} disabled={scheduleSaving}>Refresh</button>
            {message && <span className={`validation-message ${messageKind}`}>{message}</span>}
          </div>
        </section>
      </section>
    </ProtectedPage>
  );
}
