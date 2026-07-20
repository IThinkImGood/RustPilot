import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import express from "express";
import { WebSocketServer } from "ws";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultServerSettings } from "@rustpilot/shared";
import { RustAdapter, ensureRuntimeDirectories } from "@rustpilot/rust-adapter";
import { EventLogger } from "./logger.js";
import { Storage } from "./storage.js";
import { InstallManager } from "./installManager.js";
import { ServerProcessManager } from "./serverProcessManager.js";
import { SingleInstanceLock } from "./singleInstance.js";
import type { ProcessRunner } from "./processRunner.js";
import { computeSetupStatus } from "./setupStatus.js";
import { createApiRouter } from "./api.js";
import { validateInstallDirectory } from "./installDirectoryValidation.js";
import { WebRconClient } from "./webRconClient.js";
import { RestartScheduler } from "./restartScheduler.js";

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  pid = 1234;
  killed = false;
  kill(): boolean {
    this.killed = true;
    queueMicrotask(() => this.emit("exit", 0, null));
    return true;
  }
  removeAllListeners(event?: string | symbol): this {
    super.removeAllListeners(event);
    return this;
  }
}

class FakeRunner implements ProcessRunner {
  children: FakeChild[] = [];
  spawn(): any {
    const child = new FakeChild();
    this.children.push(child);
    return child;
  }
}

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "rustpilot-test-"));
  const adapter = new RustAdapter(dir);
  const paths = adapter.getPaths(defaultServerSettings);
  ensureRuntimeDirectories(paths);
  const storage = new Storage(paths.dbPath);
  storage.open();
  storage.saveSettings(defaultServerSettings);
  const logger = new EventLogger();
  const runner = new FakeRunner();
  return {
    dir,
    adapter,
    paths,
    storage,
    logger,
    runner,
    cleanup: () => {
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

describe("ServerProcessManager", () => {
  it("prevents duplicate starts", async () => {
    const f = fixture();
    try {
      writeFileSync(f.paths.steamCmdExe, "");
      writeFileSync(f.paths.rustDedicatedExe, "");
      const manager = new ServerProcessManager(f.adapter, f.storage, f.logger, f.runner);
      await manager.start(defaultServerSettings);
      await expect(manager.start(defaultServerSettings)).rejects.toThrow(/already running/);
    } finally {
      f.cleanup();
    }
  });

  it("distinguishes requested stop from crash", async () => {
    const f = fixture();
    try {
      writeFileSync(f.paths.steamCmdExe, "");
      writeFileSync(f.paths.rustDedicatedExe, "");
      const manager = new ServerProcessManager(f.adapter, f.storage, f.logger, f.runner);
      await manager.start(defaultServerSettings);
      f.runner.children[0]!.emit("exit", 1, null);
      expect(manager.getStatus().processState).toBe("crashed");
    } finally {
      f.cleanup();
    }
  });
});

describe("InstallManager", () => {
  it("prevents duplicate installs", async () => {
    const f = fixture();
    try {
      const manager = new InstallManager(f.adapter, f.storage, f.logger, f.runner);
      writeFileSync(f.paths.steamCmdExe, "");
      const first = manager.install(defaultServerSettings).catch(() => undefined);
      await expect(manager.install(defaultServerSettings)).rejects.toThrow(/already running/);
      f.runner.children[0]!.emit("exit", 1, null);
      await first;
    } finally {
      f.cleanup();
    }
  });
});

describe("WebRconClient", () => {
  it("sends JSON commands and matches responses by identifier", async () => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test address");
    server.on("connection", (socket) => {
      socket.on("message", (data) => {
        const request = JSON.parse(data.toString("utf8")) as { Identifier: number; Message: string };
        socket.send(JSON.stringify({ Identifier: request.Identifier, Message: `ran:${request.Message}`, Type: "Generic" }));
      });
    });
    const logger = new EventLogger();
    const client = new WebRconClient(logger);
    try {
      const response = await client.sendCommand({ ...defaultServerSettings, rconPort: address.port }, "serverinfo");
      expect(response.message).toBe("ran:serverinfo");
      expect(client.getStatus().state).toBe("connected");
    } finally {
      client.disconnect();
      server.close();
    }
  });
});

describe("install directory validation", () => {
  it("allows an empty managed server directory", () => {
    const f = fixture();
    try {
      const validation = validateInstallDirectory(f.adapter, defaultServerSettings);
      expect(validation.canInstall).toBe(true);
      expect(validation.writable).toBe(true);
      expect(validation.directoriesToCreate).toContain(f.paths.serverDir);
    } finally {
      f.cleanup();
    }
  });

  it("blocks a non-empty server directory that is not a RustPilot installation", () => {
    const f = fixture();
    try {
      writeFileSync(path.join(f.paths.serverDir, "user-file.txt"), "do not overwrite");
      const validation = validateInstallDirectory(f.adapter, defaultServerSettings);
      expect(validation.canInstall).toBe(false);
      expect(validation.errors.join(" ")).toMatch(/does not look like a RustPilot installation/);
    } finally {
      f.cleanup();
    }
  });

  it("requires an explicit choice for a recognized RustPilot installation", () => {
    const f = fixture();
    try {
      writeFileSync(f.paths.rustDedicatedExe, "");
      expect(validateInstallDirectory(f.adapter, defaultServerSettings).canInstall).toBe(false);
      expect(validateInstallDirectory(f.adapter, defaultServerSettings, "repair").canInstall).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  it("rejects relative or traversal install directories", () => {
    const f = fixture();
    try {
      const relative = validateInstallDirectory(f.adapter, {
        ...defaultServerSettings,
        installDirectory: "relative\\server"
      });
      const traversal = validateInstallDirectory(f.adapter, {
        ...defaultServerSettings,
        installDirectory: "D:\\RustServers\\..\\Other"
      });
      expect(relative.canInstall).toBe(false);
      expect(relative.errors.join(" ")).toMatch(/absolute install path/);
      expect(traversal.canInstall).toBe(false);
      expect(traversal.errors.join(" ")).toMatch(/unsafe segments/);
      expect(existsSync(path.join(f.dir, "relative", "server"))).toBe(false);
    } finally {
      f.cleanup();
    }
  });
});

describe("computed setup status", () => {
  it("treats setupCompleted true with missing RustDedicated.exe as incomplete and repairs it", () => {
    const f = fixture();
    try {
      writeFileSync(f.paths.steamCmdExe, "");
      f.storage.setSetupCompleted(true);
      f.storage.setInstallationState("installed");
      const status = computeSetupStatus(f.storage, f.adapter);
      expect(status.setupCompleted).toBe(false);
      expect(status.rustExecutableExists).toBe(false);
      expect(status.requiredAction).toBe("install_rust_server");
      expect(f.storage.getRuntimeSetup().setupCompleted).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  it("returns complete setup when config, persisted flag, SteamCMD, and RustDedicated.exe exist", () => {
    const f = fixture();
    try {
      writeFileSync(f.paths.steamCmdExe, "");
      writeFileSync(f.paths.rustDedicatedExe, "");
      f.storage.setSetupCompleted(true);
      f.storage.setInstallationState("installed");
      const status = computeSetupStatus(f.storage, f.adapter);
      expect(status.setupCompleted).toBe(true);
      expect(status.configurationValid).toBe(true);
      expect(status.requiredAction).toBe("none");
    } finally {
      f.cleanup();
    }
  });
});

describe("setup-gated API actions", () => {
  function createTestApi(f: ReturnType<typeof fixture>) {
    const app = express();
    const processManager = new ServerProcessManager(f.adapter, f.storage, f.logger, f.runner);
    const installer = {
      isRunning: () => false,
      install: async () => undefined,
      update: async () => undefined
    } as unknown as InstallManager;
    const webRcon = {
      getStatus: () => ({ state: "disconnected", endpoint: null, connectedAt: null, lastError: null, pendingCommands: 0 }),
      connect: async () => undefined,
      sendCommand: async (_settings: unknown, command: string) => ({
        command,
        message: "ok",
        identifier: 1,
        type: "Generic",
        durationMs: 1
      })
    } as unknown as WebRconClient;
    const restartScheduler = {
      getStatus: () => ({ scheduled: false, runAt: null, reason: null }),
      schedule: (delayMinutes: number, reason: string | null) => ({
        scheduled: true,
        runAt: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        reason
      }),
      cancel: () => ({ scheduled: false, runAt: null, reason: null })
    } as unknown as RestartScheduler;
    app.use(
      "/api",
      createApiRouter({
        storage: f.storage,
        adapter: f.adapter,
        logger: f.logger,
        installer,
        processManager,
        webRcon,
        restartScheduler,
        panelUrl: "http://127.0.0.1:40815"
      })
    );
    return app;
  }

  async function listen(app: express.Express) {
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test address");
    return { server, baseUrl: `http://127.0.0.1:${address.port}/api` };
  }

  async function request(pathname: string, init?: RequestInit) {
    const f = fixture();
    const app = createTestApi(f);
    const { server, baseUrl } = await listen(app);
    try {
      return await fetch(`${baseUrl}${pathname}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
      });
    } finally {
      server.close();
      f.cleanup();
    }
  }

  it("rejects server start when setup is incomplete", async () => {
    const response = await request("/server/start", { method: "POST", body: "{}" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: {
        code: "SETUP_INCOMPLETE",
        message: "Complete the RustPilot installation first."
      }
    });
  });

  it("allows install endpoint during setup", async () => {
    const response = await request("/install", {
      method: "POST",
      body: JSON.stringify(defaultServerSettings)
    });
    expect(response.status).toBe(202);
  });

  it("rejects install when the server directory contains unrelated files", async () => {
    const f = fixture();
    const app = express();
    writeFileSync(path.join(f.paths.serverDir, "user-file.txt"), "do not overwrite");
    const processManager = new ServerProcessManager(f.adapter, f.storage, f.logger, f.runner);
    const installer = {
      isRunning: () => false,
      install: async () => undefined,
      update: async () => undefined
    } as unknown as InstallManager;
    const webRcon = {
      getStatus: () => ({ state: "disconnected", endpoint: null, connectedAt: null, lastError: null, pendingCommands: 0 }),
      connect: async () => undefined,
      sendCommand: async (_settings: unknown, command: string) => ({
        command,
        message: "ok",
        identifier: 1,
        type: "Generic",
        durationMs: 1
      })
    } as unknown as WebRconClient;
    const restartScheduler = {
      getStatus: () => ({ scheduled: false, runAt: null, reason: null }),
      schedule: (delayMinutes: number, reason: string | null) => ({
        scheduled: true,
        runAt: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        reason
      }),
      cancel: () => ({ scheduled: false, runAt: null, reason: null })
    } as unknown as RestartScheduler;
    app.use(
      "/api",
      createApiRouter({
        storage: f.storage,
        adapter: f.adapter,
        logger: f.logger,
        installer,
        processManager,
        webRcon,
        restartScheduler,
        panelUrl: "http://127.0.0.1:40815"
      })
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test address");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaultServerSettings)
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: "INSTALL_DIRECTORY_INVALID" }
      });
    } finally {
      server.close();
      f.cleanup();
    }
  });

  it("wipes server identity data after explicit confirmation", async () => {
    const f = fixture();
    writeFileSync(f.paths.steamCmdExe, "");
    writeFileSync(f.paths.rustDedicatedExe, "");
    writeFileSync(path.join(f.paths.identityDir, "save.dat"), "world");
    f.storage.setSetupCompleted(true);
    f.storage.setInstallationState("installed");
    const app = createTestApi(f);
    const { server, baseUrl } = await listen(app);
    try {
      const response = await fetch(`${baseUrl}/admin/wipe-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "WIPE SERVER" })
      });
      expect(response.status).toBe(200);
      expect(existsSync(path.join(f.paths.identityDir, "save.dat"))).toBe(false);
      expect(existsSync(f.paths.identityDir)).toBe(true);
      expect(computeSetupStatus(f.storage, f.adapter).setupCompleted).toBe(true);
    } finally {
      server.close();
      f.cleanup();
    }
  });

  it("resets installation state and managed install folders after explicit confirmation", async () => {
    const f = fixture();
    writeFileSync(f.paths.steamCmdExe, "");
    writeFileSync(f.paths.rustDedicatedExe, "");
    writeFileSync(path.join(f.paths.logsDir, "rustpilot.log"), "log");
    f.storage.setSetupCompleted(true);
    f.storage.setInstallationState("installed");
    const app = createTestApi(f);
    const { server, baseUrl } = await listen(app);
    try {
      const response = await fetch(`${baseUrl}/admin/reset-installation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "RESET INSTALLATION" })
      });
      expect(response.status).toBe(200);
      expect(existsSync(f.paths.steamCmdDir)).toBe(false);
      expect(existsSync(f.paths.profileRoot)).toBe(false);
      expect(f.storage.getSettingsRecord().exists).toBe(false);
      expect(computeSetupStatus(f.storage, f.adapter).setupCompleted).toBe(false);
    } finally {
      server.close();
      f.cleanup();
    }
  });

  it("rejects normal settings changes during incomplete setup", async () => {
    const response = await request("/settings", {
      method: "PUT",
      body: JSON.stringify(defaultServerSettings)
    });
    expect(response.status).toBe(409);
  });

  it("allows setup-flow settings changes during incomplete setup", async () => {
    const response = await request("/settings", {
      method: "PUT",
      headers: { "x-rustpilot-setup-flow": "1" },
      body: JSON.stringify(defaultServerSettings)
    });
    expect(response.status).toBe(200);
  });
});

describe("SingleInstanceLock", () => {
  it("prevents duplicate lock acquisition", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "rustpilot-lock-"));
    try {
      const one = new SingleInstanceLock(dir);
      const two = new SingleInstanceLock(dir);
      expect(one.acquire()).toBe(true);
      expect(two.acquire()).toBe(false);
      one.release();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
