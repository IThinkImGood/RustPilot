"use client";
import { FormEvent, useEffect, useState } from "react";
import type { AuthActionLogEntry, AuthRole, AuthUser } from "@rustpilot/shared/browser";
import { api } from "../lib/api";
import { ProtectedPage } from "../lib/ProtectedPage";
import { useRustPilot } from "../lib/useRustPilot";

const roleLabels: Record<AuthRole, string> = {
  owner: "Owner",
  admin: "Admin",
  viewer: "Viewer"
};

export default function UsersPage() {
  const guard = useRustPilot();
  const currentUser = guard.status?.auth?.user ?? null;
  const canManage = currentUser?.role === "owner";
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [steamId64, setSteamId64] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AuthRole>("admin");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"ok" | "error">("ok");
  const [actionLogs, setActionLogs] = useState<AuthActionLogEntry[]>([]);

  async function loadUsers() {
    setUsers(await api<AuthUser[]>("/auth/users"));
  }

  async function loadActionLogs() {
    setActionLogs(await api<AuthActionLogEntry[]>("/auth/action-logs"));
  }

  useEffect(() => {
    if (guard.status?.setup?.setupCompleted) {
      void loadUsers().catch(() => undefined);
      void loadActionLogs().catch(() => undefined);
    }
  }, [guard.status?.setup?.setupCompleted]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setMessageKind("ok");
    try {
      await api<AuthUser>("/auth/users", {
        method: "POST",
        body: JSON.stringify({ steamId64: steamId64.trim(), displayName: displayName.trim(), role, enabled: true })
      });
      setSteamId64("");
      setDisplayName("");
      setRole("admin");
      setMessage("User saved.");
      await loadUsers();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function updateUser(user: AuthUser, updates: Partial<Pick<AuthUser, "displayName" | "role" | "enabled">>) {
    setMessage("");
    setMessageKind("ok");
    try {
      await api<AuthUser>(`/auth/users/${encodeURIComponent(user.steamId64)}`, {
        method: "PUT",
        body: JSON.stringify(updates)
      });
      await loadUsers();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteUser(user: AuthUser) {
    setMessage("");
    setMessageKind("ok");
    try {
      await api(`/auth/users/${encodeURIComponent(user.steamId64)}`, { method: "DELETE" });
      setMessage("User deleted.");
      await loadUsers();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <ProtectedPage status={guard.status} error={guard.error} loading={guard.loading} onRetry={guard.refresh}>
      <section className="panel">
        <div className="section-header">
          <div>
            <h1>Users</h1>
            <p className="muted">SteamID64 allowlist for RustPilot panel access. Steam login is the primary identity.</p>
          </div>
          <button onClick={() => void Promise.all([loadUsers(), loadActionLogs()])}>Refresh</button>
        </div>
        {canManage && (
          <form className="auth-user-form" onSubmit={submit}>
            <label>
              Display name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Example: Jarne" />
            </label>
            <label>
              SteamID64
              <input value={steamId64} onChange={(event) => setSteamId64(event.target.value)} placeholder="7656119..." />
            </label>
            <label>
              Role
              <select value={role} onChange={(event) => setRole(event.target.value as AuthRole)}>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <button className="primary" type="submit">Add user</button>
          </form>
        )}
        {message && <p className={messageKind === "ok" ? "ok" : "error"}>{message}</p>}
        <div className="auth-user-list">
          {users.map((user) => (
            <article className={`auth-user-row ${!user.enabled ? "disabled" : ""}`} key={user.steamId64}>
              <div>
                <strong>{user.displayName}</strong>
                <span>{user.steamId64}</span>
              </div>
              <div className="auth-user-meta">
                <span className="badge">{roleLabels[user.role]}</span>
                <span className="badge">{user.enabled ? "Enabled" : "Disabled"}</span>
                <span className="badge">{user.permissions.length} permissions</span>
              </div>
              {canManage && (
                <div className="auth-user-actions">
                  <select value={user.role} onChange={(event) => updateUser(user, { role: event.target.value as AuthRole })}>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button type="button" onClick={() => updateUser(user, { enabled: !user.enabled })}>
                    {user.enabled ? "Disable" : "Enable"}
                  </button>
                  <button type="button" className="danger" onClick={() => deleteUser(user)}>Delete</button>
                </div>
              )}
            </article>
          ))}
          {users.length === 0 && <p className="muted">No users loaded.</p>}
        </div>
      </section>
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Action logs</h2>
            <p className="muted">Recent authenticated changes and denied actions.</p>
          </div>
        </div>
        <div className="auth-action-log-list">
          {actionLogs.map((entry) => (
            <div className="auth-action-log-row" key={entry.id}>
              <span>{new Date(entry.timestamp).toLocaleString()}</span>
              <strong>{entry.displayName ?? "unknown"}</strong>
              <span>{entry.action}</span>
              <span className={entry.success ? "ok" : "error"}>{entry.statusCode ?? "n/a"}</span>
            </div>
          ))}
          {actionLogs.length === 0 && <p className="muted">No actions logged yet.</p>}
        </div>
      </section>
    </ProtectedPage>
  );
}
