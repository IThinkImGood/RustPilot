#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { RustAdapter, ensureRuntimeDirectories } from "@rustpilot/rust-adapter";
import { loadAppConfig } from "./config.js";
import { EventLogger } from "./logger.js";
import { Storage } from "./storage.js";
import { NodeProcessRunner } from "./processRunner.js";
import { InstallManager } from "./installManager.js";
import { ServerProcessManager } from "./serverProcessManager.js";
import { WebRconClient } from "./webRconClient.js";
import { RestartScheduler } from "./restartScheduler.js";
import { createApiRouter } from "./api.js";
import { attachWebSocketServer } from "./websocket.js";
import { openBrowser } from "./browser.js";
import { SingleInstanceLock } from "./singleInstance.js";
import { computeSetupStatus } from "./setupStatus.js";
import { waitForFrontendReady } from "./frontendReady.js";

const config = loadAppConfig();
const panelUrl = `http://${config.host}:${config.port}`;
const adapter = new RustAdapter(config.dataDir);
const paths = adapter.getPaths();
ensureRuntimeDirectories(paths);
const logger = new EventLogger();
logger.configureDiskLogging(paths.logsDir);
const lock = new SingleInstanceLock(config.dataDir);

logger.emit("rustpilot", "system", "info", "Starting RustPilot...");
if (!lock.acquire()) {
  logger.emit("rustpilot", "system", "warn", "A RustPilot instance is already running for this data folder.");
  try {
    openBrowser(panelUrl);
  } finally {
    process.exit(0);
  }
}

const storage = new Storage(paths.dbPath);
storage.open();
logger.emit("rustpilot", "system", "info", "Loading configuration...");
const runner = new NodeProcessRunner();
const installer = new InstallManager(adapter, storage, logger, runner);
const webRcon = new WebRconClient(logger);
const processManager = new ServerProcessManager(adapter, storage, logger, runner, webRcon);
const restartScheduler = new RestartScheduler(storage, processManager, logger);

const app = express();
app.disable("x-powered-by");
app.use("/api", createApiRouter({ storage, adapter, logger, installer, processManager, webRcon, restartScheduler, panelUrl }));

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const webOutCandidates = [
  path.resolve("apps/web/out"),
  path.resolve("app/apps/web/out"),
  path.resolve(moduleDir, "../../web/out")
];
const webOut = webOutCandidates.find((candidate) => fs.existsSync(candidate)) ?? webOutCandidates[0];
if (fs.existsSync(webOut) && !config.isDevelopment) {
  app.use(express.static(webOut));
  app.use((_req, res) => res.sendFile(path.join(webOut, "index.html")));
} else if (config.isDevelopment) {
  app.use(
    "/",
    createProxyMiddleware({
      target: config.webDevUrl,
      changeOrigin: false,
      ws: true,
      logLevel: "silent"
    } as never)
  );
} else {
  app.use((_req, res) => res.status(503).send("Web panel build is missing. Run npm run build."));
}

const server = http.createServer(app);
attachWebSocketServer(server, logger, processManager, installer, storage, adapter, webRcon, restartScheduler);

async function isExistingRustPilotPanelAvailable(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${panelUrl}/api/health`, { signal: controller.signal });
    if (!response.ok) return false;
    const body = (await response.json()) as { success?: boolean; data?: { name?: string } };
    return body.success === true && body.data?.name === "RustPilot";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function closeStartupResources(exitCode: number): void {
  try {
    server.close();
  } catch {
    // The server may not have started listening yet.
  }
  storage.close();
  lock.release();
  process.exit(exitCode);
}

server.on("error", (error: NodeJS.ErrnoException) => {
  void (async () => {
    if (error.code === "EADDRINUSE") {
      logger.emit("rustpilot", "system", "error", `Poort ${config.host}:${config.port} is al in gebruik.`);
      if (await isExistingRustPilotPanelAvailable()) {
        logger.emit("rustpilot", "system", "warn", `A RustPilot backend is already running at ${panelUrl}. Opening the existing web panel.`);
        openBrowser(panelUrl);
        closeStartupResources(0);
        return;
      }
      logger.emit(
        "rustpilot",
        "system",
        "error",
        `Stop the process using ${config.host}:${config.port} or choose another RUSTPILOT_PORT.`
      );
      closeStartupResources(1);
      return;
    }
    logger.emit("rustpilot", "system", "error", error.message);
    closeStartupResources(1);
  })();
});

server.listen(config.port, config.host, async () => {
  logger.emit("rustpilot", "system", "info", `Backend: ${panelUrl}`);
  if (config.isDevelopment) {
    logger.emit("rustpilot", "system", "info", `Development frontend: ${config.webDevUrl}`);
  }
  logger.emit("rustpilot", "system", "info", `Public panel: ${panelUrl}`);
  if (config.isDevelopment) {
    try {
      logger.emit("rustpilot", "system", "info", `Wachten op development frontend ${config.webDevUrl}...`);
      await waitForFrontendReady(config.webDevUrl);
    } catch (error) {
      logger.emit("rustpilot", "system", "error", error instanceof Error ? error.message : String(error));
    }
  }
  logger.emit("rustpilot", "system", "info", "Setupstatus controleren...");
  const settings = storage.getSettings();
  const setup = computeSetupStatus(storage, adapter);
  if (!setup.setupCompleted) {
    logger.emit("rustpilot", "system", "warn", "No completed server configuration found.");
    if (setup.message) logger.emit("rustpilot", "system", "warn", setup.message);
    logger.emit("rustpilot", "system", "info", `Setup wizard opened at ${panelUrl}/setup`);
    openBrowser(`${panelUrl}/setup`);
  } else {
    if (settings.openBrowser) openBrowser(panelUrl);
    if (settings.autoStart) {
      try {
        await processManager.start(settings);
      } catch (error) {
        logger.emit("rustpilot", "system", "error", error instanceof Error ? error.message : String(error));
      }
    }
  }
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", async (line) => {
  const input = line.trim();
  if (!input) return;
  if (input.startsWith("rustpilot")) {
    const command = input.split(/\s+/)[1] ?? "help";
    const settings = storage.getSettings();
    try {
      if (command === "status") logger.emit("rustpilot", "system", "info", JSON.stringify({ process: processManager.getStatus(), rcon: webRcon.getStatus() }));
      else if (command === "stop") await processManager.stop(settings);
      else if (command === "restart") await processManager.restart(settings);
      else if (command === "open") openBrowser(panelUrl);
      else if (command === "help")
        logger.emit("rustpilot", "system", "info", "Commando's: rustpilot status | stop | restart | open | help");
      else logger.emit("rustpilot", "system", "warn", `Onbekend RustPilot-commando: ${command}`);
    } catch (error) {
      logger.emit("rustpilot", "system", "error", error instanceof Error ? error.message : String(error));
    }
    return;
  }
  try {
    await processManager.sendConsoleCommand(storage.getSettings(), input);
  } catch (error) {
    logger.emit("rustpilot", "system", "warn", error instanceof Error ? error.message : String(error));
  }
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.emit("rustpilot", "system", "info", "RustPilot wordt afgesloten...");
  try {
    await processManager.shutdown(storage.getSettings());
  } finally {
    server.close();
    rl.close();
    storage.close();
    lock.release();
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.on("beforeExit", () => lock.release());
process.on("exit", () => lock.release());
