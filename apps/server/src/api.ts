import express from "express";
import { commandRequestSchema, settingsUpdateSchema } from "@rustpilot/shared";
import type { RustAdapter } from "@rustpilot/rust-adapter";
import { openBrowser } from "./browser.js";
import type { EventLogger } from "./logger.js";
import type { InstallManager } from "./installManager.js";
import type { ServerProcessManager } from "./serverProcessManager.js";
import type { Storage } from "./storage.js";
import { computeSetupStatus } from "./setupStatus.js";
import { validateInstallDirectory, type InstallDirectoryChoice } from "./installDirectoryValidation.js";

function ok<T>(data: T) {
  return { success: true as const, data };
}

function fail(code: string, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, details } };
}

const SETUP_INCOMPLETE_MESSAGE = "Complete the RustPilot installation first.";

function rejectIncompleteSetup(res: express.Response): void {
  res.status(409).json(fail("SETUP_INCOMPLETE", SETUP_INCOMPLETE_MESSAGE));
}

export function createApiRouter(deps: {
  storage: Storage;
  adapter: RustAdapter;
  logger: EventLogger;
  installer: InstallManager;
  processManager: ServerProcessManager;
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
  router.post("/server/command", (req, res) => {
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
      deps.processManager.sendConsoleCommand(parsed.data.command);
      res.json(ok({ sent: true }));
    } catch (error) {
      res.status(409).json(fail("COMMAND_UNAVAILABLE", error instanceof Error ? error.message : String(error)));
    }
  });
  router.get("/logs/recent", (_req, res) => res.json(ok({ events: deps.logger.recent(500) })));
  router.post("/system/open-panel", (_req, res) => {
    openBrowser(deps.panelUrl);
    res.json(ok({ opened: true }));
  });
  return router;
}
