"use client";
import { FormEvent, useEffect, useState } from "react";
import { defaultServerSettings } from "@rustpilot/shared/browser";
import { api } from "../lib/api";
import { useRustPilot } from "../lib/useRustPilot";
import { ProtectedPage } from "../lib/ProtectedPage";

export default function SettingsPage() {
  const guard = useRustPilot();
  const [form, setForm] = useState<any>(defaultServerSettings);
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<any>("/settings").then((settings) => setForm({ ...defaultServerSettings, ...settings, rconPassword: "" }));
  }, []);
  function set(name: string, value: unknown) {
    setForm((current: any) => ({ ...current, [name]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    await api("/settings", { method: "PUT", body: JSON.stringify(form) });
    setMessage("Settings saved. Server launch settings apply on the next restart.");
  }
  return (
    <ProtectedPage status={guard.status} error={guard.error} loading={guard.loading} onRetry={guard.refresh}>
      <div className="topbar"><h1>Settings</h1></div>
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
        <div className="actions"><button className="primary">Save</button><span className="muted">{message}</span></div>
      </form>
    </ProtectedPage>
  );
}
