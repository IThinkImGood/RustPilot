"use client";
import { useEffect, useState } from "react";
import type { BackupRestoreResult, BackupSummary } from "@rustpilot/shared/browser";
import { api } from "../../lib/api";
import { formatLocalDateTime, shortenPath } from "../../lib/format";
import { ProtectedPage } from "../../lib/ProtectedPage";
import { useRustPilot } from "../../lib/useRustPilot";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let amount = value / 1024;
  let unit = units[0]!;
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index]!;
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${unit}`;
}

export default function ManualBackupsPage() {
  const guard = useRustPilot();
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");
  const [action, setAction] = useState<"create" | "refresh" | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const [restoringFileName, setRestoringFileName] = useState<string | null>(null);
  const [confirmingBackup, setConfirmingBackup] = useState<{ kind: "delete" | "restore"; backup: BackupSummary } | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const requiredConfirmation = confirmingBackup?.kind === "restore" ? "RESTORE BACKUP" : "";

  async function loadBackups() {
    setAction("refresh");
    setMessage("");
    setMessageKind("ok");
    try {
      setBackups(await api<BackupSummary[]>("/backups"));
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(null);
    }
  }

  async function createBackup() {
    setAction("create");
    setMessage("");
    setMessageKind("ok");
    try {
      const backup = await api<BackupSummary>("/backups", { method: "POST", body: "{}" });
      setBackups((current) => [backup, ...current.filter((item) => item.fileName !== backup.fileName)]);
      setMessage("Backup created.");
      await guard.refresh();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(null);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  function openDeleteBackup(backup: BackupSummary) {
    setConfirmingBackup({ kind: "delete", backup });
    setConfirmationText("");
  }

  function openRestoreBackup(backup: BackupSummary) {
    setConfirmingBackup({ kind: "restore", backup });
    setConfirmationText("");
  }

  function closeConfirmation() {
    setConfirmingBackup(null);
    setConfirmationText("");
  }

  async function deleteBackup(backup: BackupSummary) {
    setDeletingFileName(backup.fileName);
    setMessage("");
    setMessageKind("ok");
    try {
      await api(`/backups/${encodeURIComponent(backup.fileName)}`, { method: "DELETE" });
      setBackups((current) => current.filter((item) => item.fileName !== backup.fileName));
      closeConfirmation();
      setMessage("Backup deleted.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingFileName(null);
    }
  }

  async function restoreBackup(backup: BackupSummary) {
    setRestoringFileName(backup.fileName);
    setMessage("");
    setMessageKind("ok");
    try {
      const result = await api<BackupRestoreResult>(`/backups/${encodeURIComponent(backup.fileName)}/restore`, {
        method: "POST",
        body: JSON.stringify({ confirmation: "RESTORE BACKUP" })
      });
      closeConfirmation();
      setMessage(`Backup restored. ${result.restoredFiles.length} file${result.restoredFiles.length === 1 ? "" : "s"} restored.${result.safetyBackup ? ` Safety backup: ${result.safetyBackup.fileName}` : ""}`);
      await loadBackups();
      await guard.refresh();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRestoringFileName(null);
    }
  }

  useEffect(() => {
    if (guard.status?.setup?.setupCompleted) void loadBackups();
  }, [guard.status?.setup?.setupCompleted]);

  return (
    <ProtectedPage status={guard.status} error={guard.error} loading={guard.loading} onRetry={guard.refresh}>
      <section className="card backups-page-panel manual-only">
        <div className="backups-header">
          <div>
            <h2>Manual backups</h2>
            <p className="muted">Creates a ZIP backup of the current Rust identity data and cfg files. RCON passwords and RustPilot app data are not included.</p>
          </div>
          <div className="backups-actions">
            <button type="button" onClick={loadBackups} disabled={action !== null}>
              {action === "refresh" ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" className="primary" onClick={createBackup} disabled={action !== null}>
              {action === "create" ? "Creating..." : "Create backup"}
            </button>
          </div>
        </div>
        <div className="backup-list-shell">
          {backups.length === 0 ? (
            <p className="muted backup-empty">No manual backups created yet.</p>
          ) : (
            <div className="backup-list">
              {backups.map((backup) => (
                <div className="backup-row" key={backup.fileName}>
                  <div>
                    <strong>{backup.fileName}</strong>
                    <span>{formatLocalDateTime(backup.createdAt)} - {formatBytes(backup.sizeBytes)}</span>
                  </div>
                  <span className="path-value" title={backup.path}>{shortenPath(backup.path, 58)}</span>
                  <button type="button" className="icon-button" onClick={() => copyText(backup.path)}>Copy path</button>
                  <button type="button" className="icon-button" onClick={() => openRestoreBackup(backup)} disabled={restoringFileName === backup.fileName}>
                    {restoringFileName === backup.fileName ? "Restoring..." : "Restore"}
                  </button>
                  <button type="button" className="danger icon-button" onClick={() => openDeleteBackup(backup)} disabled={deletingFileName === backup.fileName}>
                    {deletingFileName === backup.fileName ? "Deleting..." : "Delete"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {message && <p className={`validation-message ${messageKind}`}>{message}</p>}
        {confirmingBackup && (
          <div className="modal-backdrop" role="presentation">
            <section className="modal danger-modal" role="dialog" aria-modal="true" aria-labelledby="backup-confirm-title">
              <h2 id="backup-confirm-title">{confirmingBackup.kind === "restore" ? "Restore backup" : "Delete backup"}</h2>
              <p className="muted">
                {confirmingBackup.kind === "restore"
                  ? "This stops the server and replaces the current identity data with the selected backup."
                  : "This permanently removes the selected backup file."}
              </p>
              <p><strong>{confirmingBackup.backup.fileName}</strong></p>
              {confirmingBackup.kind === "restore" && (
                <label>
                  <span>Type <strong>{requiredConfirmation}</strong> to confirm</span>
                  <input autoFocus value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} />
                </label>
              )}
              <div className="actions">
                <button type="button" onClick={closeConfirmation} disabled={deletingFileName !== null || restoringFileName !== null}>Cancel</button>
                {confirmingBackup.kind === "restore" ? (
                  <button type="button" className="danger" onClick={() => restoreBackup(confirmingBackup.backup)} disabled={confirmationText !== requiredConfirmation || restoringFileName !== null}>
                    {restoringFileName ? "Restoring..." : "Restore backup"}
                  </button>
                ) : (
                  <button type="button" className="danger" onClick={() => deleteBackup(confirmingBackup.backup)} disabled={deletingFileName !== null}>
                    {deletingFileName ? "Deleting..." : "Delete backup"}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </ProtectedPage>
  );
}
