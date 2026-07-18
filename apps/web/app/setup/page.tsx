"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { defaultServerSettings, type ServerSettings } from "@rustpilot/shared/browser";
import { useRustPilot } from "../lib/useRustPilot";
import { api } from "../lib/api";
import { Tooltip } from "../lib/Tooltip";
import { hasSetupValidationErrors, validateSetupForm, type SetupValidationResult } from "../lib/setupValidation";

type SetupForm = ServerSettings & Record<string, unknown>;
type InstallDirectoryChoice = "new" | "use-existing" | "repair" | null;
type InstallDirectoryValidation = {
  canInstall: boolean;
  exists: boolean;
  empty: boolean;
  writable: boolean;
  canCreate: boolean;
  isDirectory: boolean;
  safePath: boolean;
  recognizedRustPilotInstallation: boolean;
  requiresChoice: boolean;
  choiceAccepted: boolean;
  lowDiskSpace: boolean;
  freeBytes: number | null;
  warnings: string[];
  errors: string[];
  installRoot: string;
  directoriesToCreate: string[];
};

const helpText = {
  identity:
    "Unique name for this server installation. It determines where saves, configuration, and server data are stored. Use only letters, numbers, '-' and '_'.",
  installDirectory:
    "Folder where RustPilot stores SteamCMD, server files, saves, backups, and logs for this installation. Leave empty to use the default folder.",
  hostname: "Name shown to players in the Rust server browser.",
  maxPlayers: "Maximum number of concurrent players.",
  gamePort: "Main port players use to connect to the server. It must be reachable through your firewall and router.",
  queryPort: "Used by Steam to query server information and show the server in the browser.",
  rconPort: "Port for remote management through RCON.",
  rconPassword: "Use a strong, unique password. Anyone with this password can fully manage the server.",
  worldSize: "Generated world size in meters. Larger maps use more storage and take longer to start.",
  seed: "Controls world generation. The same world size and seed always produce the same map.",
  saveInterval: "How often the server saves automatically.",
  serverUrl: "Optional website players can open from the server information.",
  headerImageUrl: "Optional banner image shown in the Rust server browser.",
  description: "Short server description visible to players.",
  autoStart: "Start the Rust server automatically when RustPilot starts.",
  openBrowser: "Open the RustPilot web panel automatically when RustPilot starts."
};

function FieldLabel({ label, help, example }: { label: string; help: string; example?: string }) {
  return (
    <span className="field-label">
      {label}
      <Tooltip text={help} example={example} label={`Help for ${label}`} />
    </span>
  );
}

function ValidationMessage({ result }: { result?: SetupValidationResult }) {
  if (!result || result.kind === "empty" || !result.message) return null;
  return <span className={`validation-message ${result.kind}`}>{result.kind === "ok" ? "OK" : "!"} {result.message}</span>;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Unknown";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
export default function SetupPage() {
  const { status, events, wsState } = useRustPilot();
  const initializedFromStatus = useRef(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SetupForm>(defaultServerSettings);
  const [error, setError] = useState("");
  const [installDirectoryChoice, setInstallDirectoryChoice] = useState<InstallDirectoryChoice>(null);
  const [directoryValidation, setDirectoryValidation] = useState<InstallDirectoryValidation | null>(null);
  const [directoryValidationError, setDirectoryValidationError] = useState("");
  const validation = useMemo(() => validateSetupForm(form), [form]);
  const hasValidationErrors = hasSetupValidationErrors(validation);
  function set(name: string, value: unknown) {
    setForm((current) => ({ ...current, [name]: value }));
    if (name === "installDirectory") {
      setInstallDirectoryChoice(null);
      setDirectoryValidation(null);
    }
  }
  async function install() {
    setError("");
    if (!directoryValidation?.canInstall) {
      setError("Check the install directory first.");
      return;
    }
    try {
      await api("/install", { method: "POST", body: JSON.stringify({ ...form, installDirectoryChoice }) });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (hasValidationErrors) {
      setError("Check the highlighted fields first.");
      return;
    }
    setError("");
    await api("/settings", {
      method: "PUT",
      body: JSON.stringify(form),
      headers: { "x-rustpilot-setup-flow": "1" }
    });
    setStep(3);
  }
  useEffect(() => {
    if (initializedFromStatus.current || !status?.settings) return;
    initializedFromStatus.current = true;
    setForm((current) => ({
      ...current,
      ...status.settings,
      rconPassword: status.settings.rconPassword || current.rconPassword
    }));
  }, [status?.settings]);
  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    setDirectoryValidationError("");
    api<InstallDirectoryValidation>("/install-directory/validate", {
      method: "POST",
      body: JSON.stringify({ ...form, installDirectoryChoice })
    })
      .then((result) => {
        if (!cancelled) setDirectoryValidation(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setDirectoryValidation(null);
          setDirectoryValidationError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [form, installDirectoryChoice, step]);
  return (
    <div className="wizard">
      <div className="topbar">
        <h1>Setup</h1>
        <span className="status">Step {step} of 5</span>
      </div>
      {step === 1 && (
        <section className="panel">
          <h2>Welcome to RustPilot</h2>
          <p>RustPilot manages a local Rust Dedicated Server from a long-running console application with a local web panel.</p>
          <p>SteamCMD and Rust Dedicated Server are downloaded directly from Valve. RustPilot does not redistribute server files.</p>
          <div className="metric"><span>Platform</span><strong>Windows 10/11 x64</strong></div>
          <label className="install-directory-intro">
            <FieldLabel label="Install directory" help={helpText.installDirectory} example="Example: C:\\RustServers\\MyServer" />
            <input
              value={String(form.installDirectory ?? "")}
              onChange={(e) => set("installDirectory", e.target.value)}
              placeholder="Empty = default folder"
            />
          </label>
          <div className="metric path-metric">
            <span>Current install root</span>
            <strong className="path-value" title={String(form.installDirectory || status?.paths?.dataRoot || "Default folder")}>
              {String(form.installDirectory || status?.paths?.dataRoot || "Default folder")}
            </strong>
          </div>
          <p className="muted">You can choose this now. RustPilot validates the folder server-side before installation can start.</p>
          <button className="primary" onClick={() => setStep(2)}>Continue</button>
        </section>
      )}
      {step === 2 && (
        <form className="panel" onSubmit={save}>
          <div className="form">
            <label>
              <FieldLabel label="Identity" help={helpText.identity} example="Storage folder: data/servers/default/" />
              <input value={String(form.identity ?? "")} onChange={(e) => set("identity", e.target.value)} aria-describedby="identity-validation" />
              <span id="identity-validation"><ValidationMessage result={validation.identity} /></span>
            </label>
            <label>
              <FieldLabel label="Install directory" help={helpText.installDirectory} example="Example: D:\\RustServers\\MyServer" />
              <input value={String(form.installDirectory ?? "")} onChange={(e) => set("installDirectory", e.target.value)} placeholder="Empty = default folder" />
            </label>
            <label>
              <FieldLabel label="Hostname" help={helpText.hostname} />
              <input value={String(form.hostname ?? "")} onChange={(e) => set("hostname", e.target.value)} />
            </label>
            <label>
              <FieldLabel label="Max players" help={helpText.maxPlayers} />
              <input type="number" value={String(form.maxPlayers ?? "")} onChange={(e) => set("maxPlayers", e.target.value)} />
            </label>
            <label>
              <FieldLabel label="Game port" help={helpText.gamePort} />
              <input type="number" value={String(form.gamePort ?? "")} onChange={(e) => set("gamePort", e.target.value)} aria-describedby="gameport-validation" />
              <span id="gameport-validation"><ValidationMessage result={validation.gamePort} /></span>
            </label>
            <label>
              <FieldLabel label="Query port" help={helpText.queryPort} />
              <input type="number" value={String(form.queryPort ?? "")} onChange={(e) => set("queryPort", e.target.value)} aria-describedby="queryport-validation" />
              <span id="queryport-validation"><ValidationMessage result={validation.queryPort} /></span>
            </label>
            <label>
              <FieldLabel label="RCON port" help={helpText.rconPort} />
              <input type="number" value={String(form.rconPort ?? "")} onChange={(e) => set("rconPort", e.target.value)} aria-describedby="rconport-validation" />
              <span id="rconport-validation"><ValidationMessage result={validation.rconPort} /></span>
            </label>
            <label>
              <FieldLabel label="RCON password" help={helpText.rconPassword} />
              <input type="password" value={String(form.rconPassword ?? "")} onChange={(e) => set("rconPassword", e.target.value)} />
            </label>
            <label>
              <FieldLabel label="World size" help={helpText.worldSize} />
              <input type="number" value={String(form.worldSize ?? "")} onChange={(e) => set("worldSize", e.target.value)} aria-describedby="worldsize-validation" />
              <span id="worldsize-validation"><ValidationMessage result={validation.worldSize} /></span>
            </label>
            <label>
              <FieldLabel label="Seed" help={helpText.seed} />
              <input type="number" value={String(form.seed ?? "")} onChange={(e) => set("seed", e.target.value)} aria-describedby="seed-validation" />
              <span id="seed-validation"><ValidationMessage result={validation.seed} /></span>
            </label>
            <label>
              <FieldLabel label="Save interval" help={helpText.saveInterval} />
              <input type="number" value={String(form.saveInterval ?? "")} onChange={(e) => set("saveInterval", e.target.value)} />
            </label>
            <label>
              <FieldLabel label="Server URL" help={helpText.serverUrl} />
              <input value={String(form.serverUrl ?? "")} onChange={(e) => set("serverUrl", e.target.value)} aria-describedby="serverurl-validation" />
              <span id="serverurl-validation"><ValidationMessage result={validation.serverUrl} /></span>
            </label>
            <label>
              <FieldLabel label="Header image URL" help={helpText.headerImageUrl} />
              <input value={String(form.headerImageUrl ?? "")} onChange={(e) => set("headerImageUrl", e.target.value)} aria-describedby="headerimage-validation" />
              <span id="headerimage-validation"><ValidationMessage result={validation.headerImageUrl} /></span>
            </label>
            <label>
              <FieldLabel label="Auto-start" help={helpText.autoStart} />
              <input type="checkbox" checked={Boolean(form.autoStart)} onChange={(e) => set("autoStart", e.target.checked)} />
            </label>
            <label>
              <FieldLabel label="Open browser automatically" help={helpText.openBrowser} />
              <input type="checkbox" checked={Boolean(form.openBrowser)} onChange={(e) => set("openBrowser", e.target.checked)} />
            </label>
          </div>
          <label style={{ marginTop: 14 }}>
            <FieldLabel label="Description" help={helpText.description} />
            <textarea value={String(form.description ?? "")} onChange={(e) => set("description", e.target.value)} />
          </label>
          {error && <p className="validation-message error">{error}</p>}
          <button className="primary" disabled={hasValidationErrors}>Review</button>
        </form>
      )}
      {step === 3 && (
        <section className="panel">
          <h2>Review</h2>
          <div className="metric"><span>Hostname</span><strong>{form.hostname}</strong></div>
          <div className="metric"><span>Identity</span><strong>{form.identity}</strong></div>
          <div className="metric"><span>Selected folder</span><strong>{String(form.installDirectory || "Default folder")}</strong></div>
          <div className="metric"><span>Ports</span><strong>{form.gamePort}, {form.queryPort}, {form.rconPort}</strong></div>
          <div className="metric"><span>RCON password</span><strong>[hidden]</strong></div>
          <p className="muted">Check Windows Firewall and port forwarding before external players connect.</p>
          <div className="install-check">
            <h3>Install Directory</h3>
            {!directoryValidation && !directoryValidationError && <p className="muted">Checking install directory...</p>}
            {directoryValidationError && <p className="validation-message error">{directoryValidationError}</p>}
            {directoryValidation && (
              <>
                <div className="metric path-metric">
                  <span>Install directory</span>
                  <strong className="path-value" title={directoryValidation.installRoot}>{directoryValidation.installRoot}</strong>
                </div>
                <div className="install-check-grid">
                  <span className={directoryValidation.safePath ? "validation-message ok" : "validation-message error"}>{directoryValidation.safePath ? "OK" : "!"} Safe path</span>
                  <span className={directoryValidation.isDirectory ? "validation-message ok" : "validation-message error"}>{directoryValidation.isDirectory ? "OK" : "!"} Directory</span>
                  <span className={directoryValidation.writable ? "validation-message ok" : "validation-message error"}>{directoryValidation.writable ? "OK" : "!"} Writable</span>
                  <span className={directoryValidation.canCreate ? "validation-message ok" : "validation-message error"}>{directoryValidation.canCreate ? "OK" : "!"} Can be created</span>
                </div>
                <p className="muted">Free disk space: {formatBytes(directoryValidation.freeBytes)}</p>
                {directoryValidation.warnings.map((warning) => (
                  <p className="validation-message warn" key={warning}>! {warning}</p>
                ))}
                {directoryValidation.errors.map((message) => (
                  <p className="validation-message error" key={message}>! {message}</p>
                ))}
                {directoryValidation.requiresChoice && (
                  <div className="choice-panel">
                    <p>An existing RustPilot installation was detected. Choose what RustPilot should do.</p>
                    <label><input type="radio" name="install-choice" checked={installDirectoryChoice === "use-existing"} onChange={() => setInstallDirectoryChoice("use-existing")} /> Use existing installation</label>
                    <label><input type="radio" name="install-choice" checked={installDirectoryChoice === "repair"} onChange={() => setInstallDirectoryChoice("repair")} /> Repair installation</label>
                    <label><input type="radio" name="install-choice" checked={installDirectoryChoice === null} onChange={() => setInstallDirectoryChoice(null)} /> Cancel</label>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="actions"><button onClick={() => setStep(2)}>Back</button><button className="primary" onClick={install} disabled={!directoryValidation?.canInstall}>Install</button></div>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        </section>
      )}
      {step === 4 && (
        <section className="panel">
          <h2>Installation</h2>
          <p>Installation status: <strong>{status?.setup?.installationState}</strong></p>
          {status?.setup?.message && <p className="muted">{status.setup.message}</p>}
          <p>WebSocket: {wsState}</p>
          <div className="console" style={{ height: 320 }}>
            {events.slice(-200).map((event) => (
              <div className={`line ${event.stream === "stderr" ? "stderr" : ""}`} key={event.id}>[{event.source}] {event.message}</div>
            ))}
          </div>
          <div
            className={`install-progress ${status?.setup?.setupCompleted ? "complete" : "active"}`}
            role="progressbar"
            aria-label="Installatievoortgang"
            aria-valuetext={status?.setup?.setupCompleted ? "Installation complete" : "Installation in progress"}
          >
            <span />
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button onClick={install} disabled={status?.installRunning}>Try again</button>
            <button className="primary" disabled={!status?.setup?.setupCompleted} onClick={() => setStep(5)}>Finish</button>
          </div>
        </section>
      )}
      {step === 5 && (
        <section className="panel">
          <h2>Complete</h2>
          <p>SteamCMD: {status?.setup?.steamCmdInstalled ? "found" : "missing"}</p>
          <p>RustDedicated.exe: {status?.setup?.rustExecutableExists ? "found" : "missing"}</p>
          <div className="actions">
            <button className="primary" disabled={!status?.setup?.setupCompleted} onClick={() => api("/server/start", { method: "POST", body: "{}" })}>Start server</button>
            <a href="/"><button>Open dashboard</button></a>
          </div>
        </section>
      )}
    </div>
  );
}
