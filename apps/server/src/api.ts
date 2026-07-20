import fs from "node:fs";
import express from "express";
import { commandRequestSchema, settingsUpdateSchema } from "@rustpilot/shared";
import type { RustAdapter } from "@rustpilot/rust-adapter";
import { openBrowser } from "./browser.js";
import type { EventLogger } from "./logger.js";
import type { InstallManager } from "./installManager.js";
import type { ServerProcessManager } from "./serverProcessManager.js";
import type { Storage } from "./storage.js";
import type { WebRconClient } from "./webRconClient.js";
import type { RestartScheduler } from "./restartScheduler.js";
import { computeSetupStatus } from "./setupStatus.js";
import { validateInstallDirectory, type InstallDirectoryChoice } from "./installDirectoryValidation.js";

function ok<T>(data: T) {
  return { success: true as const, data };
}

function fail(code: string, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, details } };
}

const SETUP_INCOMPLETE_MESSAGE = "Complete the RustPilot installation first.";
const WIPE_CONFIRMATION = "WIPE SERVER";
const RESET_CONFIRMATION = "RESET INSTALLATION";

function rejectIncompleteSetup(res: express.Response): void {
  res.status(409).json(fail("SETUP_INCOMPLETE", SETUP_INCOMPLETE_MESSAGE));
}

function hasConfirmation(req: express.Request, expected: string): boolean {
  return typeof req.body?.confirmation === "string" && req.body.confirmation.trim() === expected;
}

function removeDirectory(directory: string): void {
  fs.rmSync(directory, { recursive: true, force: true });
}

function rejectIfRconUnavailable(deps: { storage: Storage; adapter: RustAdapter; processManager: ServerProcessManager }, res: express.Response): boolean {
  const setup = computeSetupStatus(deps.storage, deps.adapter);
  if (!setup.setupCompleted) {
    rejectIncompleteSetup(res);
    return true;
  }
  if (deps.processManager.getStatus().processState !== "running") {
    res.status(409).json(fail("SERVER_NOT_RUNNING", "Start the Rust server before using WebRCON."));
    return true;
  }
  return false;
}

function rconQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function simpleText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

export function createApiRouter(deps: {
  storage: Storage;
  adapter: RustAdapter;
  logger: EventLogger;
  installer: InstallManager;
  processManager: ServerProcessManager;
  webRcon: WebRconClient;
  restartScheduler: RestartScheduler;
  panelUrl: string;
}): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: "100kb" }));
  router.use((req, res, next) => {
    const remote = req.socket.remoteAddress;
    const origin = req.headers.origin;
    if (remote && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) {
      res.status(403).json(fail("NON_LOCAL_REQUEST", "Only local requests are allowed."));
      return;
    }
    if (origin && !origin.startsWith("http://127.0.0.1:") && !origin.startsWith("http://localhost:")) {
      res.status(403).json(fail("INVALID_ORIGIN", "Only local origins are allowed."));
      return;
    }
    next();
  });

  router.get("/health", (_req, res) => res.json(ok({ name: "RustPilot", ok: true })));
  router.get("/status", (_req, res) => {
    const settings = deps.storage.getSettings();
    const paths = deps.adapter.getPaths(settings);
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    res.json(
      ok({
        process: deps.processManager.getStatus(),
        setup,
        paths: {
          dataRoot: paths.dataRoot,
          installDir: paths.serverDir,
          rustDedicatedExe: paths.rustDedicatedExe
        },
        settings: { ...settings, rconPassword: "" },
        redactedLaunchArgs: deps.adapter.generateRedactedLaunchArguments(settings),
        rcon: deps.webRcon.getStatus(),
        scheduledRestart: deps.restartScheduler.getStatus(),
        websocket: {
          path: "/ws",
          url: deps.panelUrl.replace(/^http/, "ws") + "/ws"
        },
        installRunning: deps.installer.isRunning()
      })
    );
  });
  router.get("/setup", (_req, res) => {
    res.json(ok(computeSetupStatus(deps.storage, deps.adapter)));
  });
  router.get("/setup/status", (_req, res) => {
    res.json(ok(computeSetupStatus(deps.storage, deps.adapter)));
  });
  router.post("/install-directory/validate", (req, res) => {
    const parsed = settingsUpdateSchema.safeParse({ ...deps.storage.getSettings(), ...req.body });
    if (!parsed.success) {
      res.status(400).json(fail("VALIDATION_FAILED", "Installation settings are invalid.", parsed.error.flatten()));
      return;
    }
    const choice = typeof req.body?.installDirectoryChoice === "string" ? (req.body.installDirectoryChoice as InstallDirectoryChoice) : null;
    res.json(ok(validateInstallDirectory(deps.adapter, parsed.data, choice)));
  });
  router.get("/settings", (_req, res) => {
    const settings = deps.storage.getSettings();
    res.json(ok({ ...settings, rconPassword: "" }));
  });
  router.put("/settings", (req, res) => {
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    const setupFlow = req.headers["x-rustpilot-setup-flow"] === "1";
    if (!setup.setupCompleted && !setupFlow) {
      rejectIncompleteSetup(res);
      return;
    }
    const existing = deps.storage.getSettings();
    const parsed = settingsUpdateSchema.safeParse({ ...existing, ...req.body });
    if (!parsed.success) {
      res.status(400).json(fail("VALIDATION_FAILED", "Settings are invalid.", parsed.error.flatten()));
      return;
    }
    deps.storage.saveSettings(parsed.data);
    const installed = deps.adapter.detectServerInstallation(parsed.data);
    if (deps.adapter.detectSteamCmd(parsed.data) && installed) deps.storage.setSetupCompleted(true);
    res.json(ok({ ...parsed.data, rconPassword: "" }));
  });
  router.post("/install", async (req, res) => {
    const parsed = settingsUpdateSchema.safeParse({ ...deps.storage.getSettings(), ...req.body });
    if (!parsed.success) {
      res.status(400).json(fail("VALIDATION_FAILED", "Installation settings are invalid.", parsed.error.flatten()));
      return;
    }
    const choice = typeof req.body?.installDirectoryChoice === "string" ? (req.body.installDirectoryChoice as InstallDirectoryChoice) : null;
    const directoryValidation = validateInstallDirectory(deps.adapter, parsed.data, choice);
    if (!directoryValidation.canInstall) {
      res.status(409).json(fail("INSTALL_DIRECTORY_INVALID", "Check the install directory first.", directoryValidation));
      return;
    }
    deps.storage.saveSettings(parsed.data);
    deps.installer
      .install(parsed.data)
      .then(() => {
        deps.storage.setSetupCompleted(true);
      })
      .catch(() => undefined);
    res.status(202).json(ok({ started: true }));
  });
  router.post("/update", async (_req, res) => {
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    if (!setup.setupCompleted) {
      rejectIncompleteSetup(res);
      return;
    }
    const settings = deps.storage.getSettings();
    deps.installer.update(settings).catch(() => undefined);
    res.status(202).json(ok({ started: true }));
  });
  router.post("/server/start", async (_req, res) => {
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    if (!setup.setupCompleted) {
      rejectIncompleteSetup(res);
      return;
    }
    try {
      await deps.processManager.start(deps.storage.getSettings());
      res.json(ok({ started: true }));
    } catch (error) {
      res.status(409).json(fail("SERVER_START_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.post("/server/stop", async (_req, res) => {
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    if (!setup.setupCompleted) {
      rejectIncompleteSetup(res);
      return;
    }
    await deps.processManager.stop(deps.storage.getSettings());
    res.json(ok({ stopped: true }));
  });
  router.post("/server/restart", async (_req, res) => {
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    if (!setup.setupCompleted) {
      rejectIncompleteSetup(res);
      return;
    }
    try {
      await deps.processManager.restart(deps.storage.getSettings());
      res.json(ok({ restarted: true }));
    } catch (error) {
      res.status(409).json(fail("SERVER_RESTART_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.post("/server/command", async (req, res) => {
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    if (!setup.setupCompleted) {
      rejectIncompleteSetup(res);
      return;
    }
    const parsed = commandRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(fail("VALIDATION_FAILED", "Command is invalid.", parsed.error.flatten()));
      return;
    }
    try {
      await deps.processManager.sendConsoleCommand(deps.storage.getSettings(), parsed.data.command);
      res.json(ok({ sent: true }));
    } catch (error) {
      res.status(409).json(fail("COMMAND_UNAVAILABLE", error instanceof Error ? error.message : String(error)));
    }
  });
  router.get("/rcon/status", (_req, res) => {
    res.json(ok(deps.webRcon.getStatus()));
  });
  router.post("/rcon/connect", async (_req, res) => {
    if (rejectIfRconUnavailable(deps, res)) return;
    try {
      await deps.webRcon.connect(deps.storage.getSettings());
      res.json(ok(deps.webRcon.getStatus()));
    } catch (error) {
      res.status(409).json(fail("RCON_CONNECT_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.post("/rcon/server-info", async (_req, res) => {
    if (rejectIfRconUnavailable(deps, res)) return;
    try {
      res.json(ok(await deps.webRcon.sendCommand(deps.storage.getSettings(), "serverinfo")));
    } catch (error) {
      res.status(409).json(fail("RCON_COMMAND_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.post("/rcon/players", async (_req, res) => {
    if (rejectIfRconUnavailable(deps, res)) return;
    try {
      res.json(ok(await deps.webRcon.sendCommand(deps.storage.getSettings(), "playerlist")));
    } catch (error) {
      res.status(409).json(fail("RCON_COMMAND_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.post("/rcon/say", async (req, res) => {
    if (rejectIfRconUnavailable(deps, res)) return;
    const message = simpleText(req.body?.message, 200);
    if (!message) {
      res.status(400).json(fail("VALIDATION_FAILED", "Announcement must be 1-200 characters."));
      return;
    }
    try {
      res.json(ok(await deps.webRcon.sendCommand(deps.storage.getSettings(), `say ${rconQuote(message)}`)));
    } catch (error) {
      res.status(409).json(fail("RCON_COMMAND_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.post("/rcon/kick", async (req, res) => {
    if (rejectIfRconUnavailable(deps, res)) return;
    const player = simpleText(req.body?.player, 80);
    const reasonRaw = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!player || reasonRaw.length > 160 || /[\r\n]/.test(reasonRaw)) {
      res.status(400).json(fail("VALIDATION_FAILED", "Player is required and reason must be at most 160 characters."));
      return;
    }
    const command = reasonRaw ? `kick ${rconQuote(player)} ${rconQuote(reasonRaw)}` : `kick ${rconQuote(player)}`;
    try {
      res.json(ok(await deps.webRcon.sendCommand(deps.storage.getSettings(), command)));
    } catch (error) {
      res.status(409).json(fail("RCON_COMMAND_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.post("/rcon/ban", async (req, res) => {
    if (rejectIfRconUnavailable(deps, res)) return;
    const player = simpleText(req.body?.player, 80);
    const reasonRaw = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!player || reasonRaw.length > 160 || /[\r\n]/.test(reasonRaw)) {
      res.status(400).json(fail("VALIDATION_FAILED", "Player is required and reason must be at most 160 characters."));
      return;
    }
    const command = reasonRaw ? `ban ${rconQuote(player)} ${rconQuote(reasonRaw)}` : `ban ${rconQuote(player)}`;
    try {
      res.json(ok(await deps.webRcon.sendCommand(deps.storage.getSettings(), command)));
    } catch (error) {
      res.status(409).json(fail("RCON_COMMAND_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.get("/scheduler/restart", (_req, res) => {
    res.json(ok(deps.restartScheduler.getStatus()));
  });
  router.post("/scheduler/restart", (req, res) => {
    if (rejectIfRconUnavailable(deps, res)) return;
    const delayMinutes = Number(req.body?.delayMinutes);
    const reasonRaw = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reasonRaw.length > 160 || /[\r\n]/.test(reasonRaw)) {
      res.status(400).json(fail("VALIDATION_FAILED", "Reason must be at most 160 characters."));
      return;
    }
    try {
      res.json(ok(deps.restartScheduler.schedule(delayMinutes, reasonRaw || null)));
    } catch (error) {
      res.status(400).json(fail("VALIDATION_FAILED", error instanceof Error ? error.message : String(error)));
    }
  });
  router.post("/scheduler/restart/cancel", (_req, res) => {
    res.json(ok(deps.restartScheduler.cancel()));
  });
  router.post("/admin/wipe-server", async (req, res) => {
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    if (!setup.setupCompleted) {
      rejectIncompleteSetup(res);
      return;
    }
    if (deps.installer.isRunning()) {
      res.status(409).json(fail("INSTALL_RUNNING", "Wait until the current installation or update finishes."));
      return;
    }
    if (!hasConfirmation(req, WIPE_CONFIRMATION)) {
      res.status(400).json(fail("CONFIRMATION_REQUIRED", `Type ${WIPE_CONFIRMATION} to confirm.`));
      return;
    }
    const settings = deps.storage.getSettings();
    const paths = deps.adapter.getPaths(settings);
    await deps.processManager.stop(settings);
    removeDirectory(paths.identityDir);
    fs.mkdirSync(paths.identityDir, { recursive: true });
    deps.logger.emit("rustpilot", "system", "warn", `Server identity data wiped: ${paths.identityDir}`);
    res.json(ok({ wiped: true, identityDir: paths.identityDir }));
  });
  router.post("/admin/reset-installation", async (req, res) => {
    const setup = computeSetupStatus(deps.storage, deps.adapter);
    if (!setup.setupCompleted) {
      rejectIncompleteSetup(res);
      return;
    }
    if (deps.installer.isRunning()) {
      res.status(409).json(fail("INSTALL_RUNNING", "Wait until the current installation or update finishes."));
      return;
    }
    if (!hasConfirmation(req, RESET_CONFIRMATION)) {
      res.status(400).json(fail("CONFIRMATION_REQUIRED", `Type ${RESET_CONFIRMATION} to confirm.`));
      return;
    }
    const settings = deps.storage.getSettings();
    const paths = deps.adapter.getPaths(settings);
    await deps.processManager.stop(settings);
    removeDirectory(paths.steamCmdDir);
    removeDirectory(paths.profileRoot);
    removeDirectory(paths.logsDir);
    fs.mkdirSync(paths.logsDir, { recursive: true });
    deps.storage.resetSetup();
    deps.logger.emit("rustpilot", "system", "warn", "Installation reset. Setup must be completed again.");
    res.json(ok({ reset: true }));
  });
  router.get("/logs/recent", (_req, res) => res.json(ok({ events: deps.logger.recent(500) })));
  router.post("/system/open-panel", (_req, res) => {
    openBrowser(deps.panelUrl);
    res.json(ok({ opened: true }));
  });
  return router;
}
